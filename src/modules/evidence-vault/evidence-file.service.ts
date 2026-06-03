import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EvidenceFile } from '@prisma/client';
import { createHash } from 'crypto';
import { EvidenceExportBundle } from '@prisma/client';
import { AuthenticatedUser } from '../../common/auth/auth.types';
import { BlobService } from '../../common/blob/blob.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { QUEUE_NAMES } from '../../common/queue/queue-names';
import { QueueService } from '../../common/queue/queue.service';
import { EvidenceService } from './evidence.service';

/**
 * Evidence Vault file operations (Phase 10A).
 *
 * Composes 8D BlobService for bytes-on-disk and the existing
 * EvidenceService for chain-of-custody appends. Files are tenant-scoped
 * by the JWT-resolved tenantId on every operation; the BlobService
 * itself enforces a `tenant-<id>/<eventId>/<filename>` path prefix so
 * cross-tenant access is impossible at the storage layer too.
 *
 * Retention + legal hold:
 *  - `retentionUntil` is informational at this stage; an out-of-band
 *    job (Phase 11C cleanup worker) will read it and purge expired
 *    files. Setting it just records the deadline.
 *  - `legalHold` short-circuits the future purge. Any logged-in user
 *    on the owning tenant can flip it; flipping it is itself a chain
 *    of custody event.
 */
@Injectable()
export class EvidenceFileService {
  private readonly logger = new Logger(EvidenceFileService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly blob: BlobService,
    private readonly evidence: EvidenceService,
    private readonly queue: QueueService,
  ) {}

  /**
   * CP-11 — request a persisted, checksummed evidence export bundle. Enqueues
   * the evidence-export queue; the EvidenceExportWorker builds + persists an
   * EvidenceExportBundle (status READY) with a SHA-256 of the manifest. Falls
   * back to synchronous processing when Redis is unset, so the call always
   * produces a bundle.
   */
  async requestExportBundle(
    user: AuthenticatedUser,
    evidenceEventId: string,
  ): Promise<{ queued: boolean; bundle?: EvidenceExportBundle }> {
    const event = await this.requireEvent(user, evidenceEventId);
    const jobId = await this.queue.enqueue(QUEUE_NAMES.EvidenceExport, {
      evidenceEventId: event.id,
      tenantId: event.tenantId ?? user.tenantId,
      requestedByUserId: user.userId,
    });
    if (!jobId) {
      const bundle = await this.processBundle(
        event.id,
        event.tenantId ?? user.tenantId,
        user.userId,
      );
      return { queued: false, bundle };
    }
    return { queued: true };
  }

  /**
   * CP-11 — build + persist the export bundle (called by the worker and by the
   * synchronous fallback). The bundle is a frozen manifest of the event + its
   * files (filename, mime, size, sha256), with a SHA-256 checksum over the
   * canonical manifest so a third party can prove integrity. Chain-of-custody
   * logged.
   */
  async processBundle(
    evidenceEventId: string,
    tenantId: string,
    requestedByUserId: string,
  ): Promise<EvidenceExportBundle> {
    const event = await this.prisma.evidenceEvent.findUnique({
      where: { id: evidenceEventId },
      select: { id: true, tenantId: true, eventType: true, occurredAt: true, eventHash: true },
    });
    if (!event) throw new NotFoundException('Evidence event not found');
    const files = await this.prisma.evidenceFile.findMany({
      where: { evidenceEventId: event.id },
      orderBy: { uploadedAt: 'asc' },
    });

    const manifest = {
      kind: 'VIGISCAM_EVIDENCE_BUNDLE',
      event: {
        id: event.id,
        eventType: event.eventType,
        occurredAt: event.occurredAt,
        eventHash: event.eventHash,
      },
      files: files.map((f) => ({
        id: f.id,
        filename: f.filename,
        mimeType: f.mimeType,
        sizeBytes: f.sizeBytes.toString(),
        sha256: f.sha256,
        uploadedAt: f.uploadedAt,
      })),
      generatedAt: new Date().toISOString(),
      requestedByUserId,
    };
    const checksum = createHash('sha256')
      .update(JSON.stringify(manifest))
      .digest('hex');

    const bundle = await this.prisma.evidenceExportBundle.create({
      data: {
        tenantId,
        filters: { evidenceEventId: event.id } as never,
        recordCount: files.length,
        checksum,
        bundle: manifest as never,
        status: 'READY',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    await this.evidence.append({
      tenantId: event.tenantId,
      actorId: requestedByUserId,
      actorType: 'USER',
      entityType: 'EVIDENCE_EXPORT_BUNDLE',
      entityId: bundle.id,
      eventType: 'EVIDENCE_BUNDLE_PERSISTED',
      eventDescription: `Evidence bundle persisted (${files.length} file(s), checksum ${checksum.slice(0, 12)}…)`,
      metadata: { evidenceEventId: event.id, recordCount: files.length, checksum },
    });
    return bundle;
  }

  /** CP-11 — fetch a persisted bundle (tenant-scoped). */
  async getBundle(user: AuthenticatedUser, bundleId: string): Promise<EvidenceExportBundle> {
    const bundle = await this.prisma.evidenceExportBundle.findUnique({ where: { id: bundleId } });
    if (!bundle || bundle.tenantId !== user.tenantId) {
      throw new NotFoundException('Export bundle not found');
    }
    return bundle;
  }

  async upload(
    user: AuthenticatedUser,
    evidenceEventId: string,
    file: {
      originalname: string;
      mimetype: string;
      buffer: Buffer;
      size: number;
    },
    opts: {
      retentionUntil?: string;
      legalHold?: boolean;
      metadata?: Record<string, unknown>;
    } = {},
  ): Promise<EvidenceFile> {
    const event = await this.requireEvent(user, evidenceEventId);

    // Compute sha256 locally; the blob service also computes it
    // server-side. Storing it on the row lets a verifier compare without
    // pulling bytes out of Blob.
    const sha256 = createHash('sha256').update(file.buffer).digest('hex');

    const result = await this.blob.upload({
      tenantId: event.tenantId ?? 'system',
      evidenceEventId: event.id,
      filename: file.originalname,
      contentType: file.mimetype,
      data: file.buffer,
    });

    // Graceful-no-op mode (no Azure Storage env) — record the file
    // metadata anyway so the audit trail isn't blocked; downstream
    // share/export return an empty signed URL in this state.
    const blobUri = result?.blobUri ?? `blob://stub/${event.id}/${file.originalname}`;

    const row = await this.prisma.evidenceFile.create({
      data: {
        evidenceEventId: event.id,
        tenantId: event.tenantId,
        filename: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: BigInt(file.size),
        sha256,
        blobUri,
        retentionUntil: opts.retentionUntil ? new Date(opts.retentionUntil) : null,
        legalHold: opts.legalHold ?? false,
        uploadedByUserId: user.userId,
        metadata: opts.metadata as never,
      },
    });

    // Chain-of-custody — the upload itself is an evidence event
    // chained onto the same tenant's hash chain.
    await this.evidence.append({
      tenantId: event.tenantId,
      actorId: user.userId,
      actorType: 'USER',
      entityType: 'EVIDENCE_FILE',
      entityId: row.id,
      eventType: 'EVIDENCE_FILE_UPLOADED',
      eventDescription: `File "${file.originalname}" uploaded to evidence event ${event.id}`,
      metadata: {
        evidenceEventId: event.id,
        sizeBytes: file.size,
        mimeType: file.mimetype,
        sha256,
        legalHold: opts.legalHold ?? false,
      },
    });

    return row;
  }

  async generateShareLinks(
    user: AuthenticatedUser,
    evidenceEventId: string,
    opts: { fileId?: string; expiresInSeconds?: number } = {},
  ): Promise<Array<{ fileId: string; filename: string; url: string | null }>> {
    const event = await this.requireEvent(user, evidenceEventId);
    const files = await this.prisma.evidenceFile.findMany({
      where: {
        evidenceEventId: event.id,
        ...(opts.fileId ? { id: opts.fileId } : {}),
      },
    });
    if (opts.fileId && files.length === 0) {
      throw new NotFoundException('Evidence file not found');
    }

    const expiresInSeconds = opts.expiresInSeconds ?? 15 * 60;
    const links = await Promise.all(
      files.map(async (f) => ({
        fileId: f.id,
        filename: f.filename,
        url: await this.blob.generateReadUrl({
          tenantId: event.tenantId ?? 'system',
          evidenceEventId: event.id,
          filename: f.filename,
          expiresInSeconds,
        }),
      })),
    );

    // Every share is a chain-of-custody event so post-hoc audit can see
    // who shared what and when, without revealing the URL itself.
    await this.evidence.append({
      tenantId: event.tenantId,
      actorId: user.userId,
      actorType: 'USER',
      entityType: 'EVIDENCE_FILE',
      entityId: event.id,
      eventType: 'EVIDENCE_FILE_SHARED',
      eventDescription: `Generated signed URLs for ${links.length} file(s)`,
      metadata: {
        fileIds: links.map((l) => l.fileId),
        expiresInSeconds,
      },
    });

    return links;
  }

  /**
   * Bundle export — returns metadata + signed URLs for every file on
   * the event. The actual ZIP roll-up is a Phase 11C worker job
   * (the `evidence-export` BullMQ queue is the substrate for that).
   * For now the caller gets a manifest the frontend can render.
   */
  async exportBundle(
    user: AuthenticatedUser,
    evidenceEventId: string,
    expiresInSeconds = 30 * 60,
  ): Promise<{
    event: { id: string; eventType: string; occurredAt: Date };
    files: Array<{
      id: string;
      filename: string;
      mimeType: string;
      sizeBytes: string;
      sha256: string;
      legalHold: boolean;
      retentionUntil: Date | null;
      uploadedAt: Date;
      url: string | null;
    }>;
  }> {
    const event = await this.requireEvent(user, evidenceEventId);
    const files = await this.prisma.evidenceFile.findMany({
      where: { evidenceEventId: event.id },
      orderBy: { uploadedAt: 'asc' },
    });

    const fileResults = await Promise.all(
      files.map(async (f) => ({
        id: f.id,
        filename: f.filename,
        mimeType: f.mimeType,
        // BigInt → string for safe JSON serialization; the shim in
        // main.ts already handles raw BigInt, but being explicit on a
        // dedicated export DTO is clearer for OpenAPI consumers.
        sizeBytes: f.sizeBytes.toString(),
        sha256: f.sha256,
        legalHold: f.legalHold,
        retentionUntil: f.retentionUntil,
        uploadedAt: f.uploadedAt,
        url: await this.blob.generateReadUrl({
          tenantId: event.tenantId ?? 'system',
          evidenceEventId: event.id,
          filename: f.filename,
          expiresInSeconds,
        }),
      })),
    );

    await this.evidence.append({
      tenantId: event.tenantId,
      actorId: user.userId,
      actorType: 'USER',
      entityType: 'EVIDENCE_FILE',
      entityId: event.id,
      eventType: 'EVIDENCE_BUNDLE_EXPORTED',
      eventDescription: `Bundle exported (${files.length} file(s))`,
      metadata: {
        fileCount: files.length,
        expiresInSeconds,
      },
    });

    return {
      event: {
        id: event.id,
        eventType: event.eventType,
        occurredAt: event.occurredAt,
      },
      files: fileResults,
    };
  }

  /**
   * Public-safe redacted view. Returns file metadata WITHOUT signed
   * URLs and WITHOUT raw blob paths — for surfaces where the audience
   * is wider than the file owner (e.g. agency-feeds, registry appeals).
   */
  async publicSafeView(
    user: AuthenticatedUser,
    evidenceEventId: string,
  ): Promise<{
    event: { id: string; eventType: string; occurredAt: Date };
    files: Array<{
      id: string;
      filename: string;
      mimeType: string;
      sizeBytes: string;
      uploadedAt: Date;
    }>;
  }> {
    const event = await this.requireEvent(user, evidenceEventId);
    const files = await this.prisma.evidenceFile.findMany({
      where: { evidenceEventId: event.id },
      orderBy: { uploadedAt: 'asc' },
    });
    return {
      event: {
        id: event.id,
        eventType: event.eventType,
        occurredAt: event.occurredAt,
      },
      files: files.map((f) => ({
        id: f.id,
        filename: f.filename,
        mimeType: f.mimeType,
        sizeBytes: f.sizeBytes.toString(),
        uploadedAt: f.uploadedAt,
      })),
    };
  }

  async setLegalHold(
    user: AuthenticatedUser,
    fileId: string,
    legalHold: boolean,
  ): Promise<EvidenceFile> {
    const file = await this.prisma.evidenceFile.findUnique({
      where: { id: fileId },
    });
    if (!file) throw new NotFoundException('Evidence file not found');
    if (file.tenantId && file.tenantId !== user.tenantId) {
      throw new ForbiddenException();
    }
    if (file.legalHold === legalHold) {
      throw new BadRequestException(`Legal hold is already ${legalHold ? 'set' : 'cleared'}`);
    }
    const updated = await this.prisma.evidenceFile.update({
      where: { id: fileId },
      data: { legalHold },
    });
    await this.evidence.append({
      tenantId: file.tenantId,
      actorId: user.userId,
      actorType: 'USER',
      entityType: 'EVIDENCE_FILE',
      entityId: fileId,
      eventType: legalHold ? 'EVIDENCE_FILE_LEGAL_HOLD_SET' : 'EVIDENCE_FILE_LEGAL_HOLD_LIFTED',
      eventDescription: legalHold
        ? `Legal hold placed on file ${file.filename}`
        : `Legal hold lifted on file ${file.filename}`,
      metadata: { fileId, legalHold },
    });
    return updated;
  }

  // ───────────────────────────────────────────────────────────────────────────

  private async requireEvent(
    user: AuthenticatedUser,
    evidenceEventId: string,
  ): Promise<{
    id: string;
    tenantId: string | null;
    eventType: string;
    occurredAt: Date;
  }> {
    const event = await this.prisma.evidenceEvent.findUnique({
      where: { id: evidenceEventId },
      select: { id: true, tenantId: true, eventType: true, occurredAt: true },
    });
    if (!event) throw new NotFoundException('Evidence event not found');
    if (event.tenantId && event.tenantId !== user.tenantId) {
      throw new ForbiddenException();
    }
    return event;
  }
}
