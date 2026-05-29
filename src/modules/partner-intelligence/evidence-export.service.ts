import { Injectable, NotFoundException } from '@nestjs/common';
import { EvidenceEvent, Prisma } from '@prisma/client';
import { createHash, randomUUID } from 'crypto';
import { PartnerPrincipal } from '../../common/auth/partner.types';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EvidenceService } from '../evidence-vault/evidence.service';
import { CreateExportRequestDto } from './dto/create-export-request.dto';

/** Cap one bundle at this many events. Partners paginate with date ranges. */
const MAX_BUNDLE_EVENTS = 5000;
const DEFAULT_TTL_DAYS = 30;

/** The shape stored in the `bundle` JSONB column and returned on download. */
export interface EvidenceExportBundlePayload {
  bundleId: string;
  tenantId: string;
  generatedAt: string;
  filters: CreateExportRequestDto;
  recordCount: number;
  /** Format: `sha256:<hex>` — over `JSON.stringify(events)`. */
  checksum: string;
  events: ProjectedEvidenceEvent[];
}

interface ProjectedEvidenceEvent {
  id: string;
  sequence: number;
  actorId: string | null;
  actorType: string | null;
  entityType: string;
  entityId: string;
  eventType: string;
  eventDescription: string;
  metadata: Prisma.JsonValue;
  ipAddress: string | null;
  previousHash: string | null;
  eventHash: string;
  occurredAt: string;
  createdAt: string;
}

/**
 * Partner evidence-export bundles (PDF §39 "legal export controls", docs/04
 * §6). A frozen snapshot of the partner tenant's Evidence Vault events at a
 * point in time, with a SHA-256 checksum so the partner can prove the bundle
 * has not been tampered with. The bundle is persisted as-generated and
 * re-served verbatim on download — never recomputed — so the legal record
 * cannot drift after the fact.
 */
@Injectable()
export class EvidenceExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly evidence: EvidenceService,
  ) {}

  async generateBundle(
    partner: PartnerPrincipal,
    dto: CreateExportRequestDto,
  ): Promise<EvidenceExportBundlePayload> {
    const where: Prisma.EvidenceEventWhereInput = { tenantId: partner.tenantId };
    if (dto.entityType) {
      where.entityType = dto.entityType;
    }
    if (dto.entityId) {
      where.entityId = dto.entityId;
    }
    if (dto.from || dto.to) {
      const range: Prisma.DateTimeFilter = {};
      if (dto.from) range.gte = new Date(dto.from);
      if (dto.to) range.lte = new Date(dto.to);
      where.occurredAt = range;
    }

    const rows = await this.prisma.evidenceEvent.findMany({
      where,
      orderBy: { sequence: 'asc' },
      take: MAX_BUNDLE_EVENTS,
    });

    const events = rows.map((e) => this.project(e));
    // Checksum over the canonical JSON of the events array. The same input
    // applied client-side must reproduce the same hash.
    const checksumHex = createHash('sha256').update(JSON.stringify(events)).digest('hex');
    const checksum = `sha256:${checksumHex}`;

    const bundleId = randomUUID();
    const expiresAt = new Date(Date.now() + DEFAULT_TTL_DAYS * 24 * 60 * 60 * 1000);
    const payload: EvidenceExportBundlePayload = {
      bundleId,
      tenantId: partner.tenantId,
      generatedAt: new Date().toISOString(),
      filters: dto,
      recordCount: events.length,
      checksum,
      events,
    };

    await this.prisma.evidenceExportBundle.create({
      data: {
        id: bundleId,
        tenantId: partner.tenantId,
        requestedByKeyId: partner.keyId,
        filters: dto as unknown as Prisma.InputJsonValue,
        recordCount: events.length,
        checksum,
        bundle: payload as unknown as Prisma.InputJsonValue,
        expiresAt,
      },
    });

    // Self-referential audit: an export of evidence is itself recorded as
    // evidence. The next export (if scope overlaps) will include this entry.
    await this.evidence.append({
      tenantId: partner.tenantId,
      actorType: 'PARTNER',
      entityType: 'EVIDENCE_EXPORT_BUNDLE',
      entityId: bundleId,
      eventType: 'EVIDENCE_EXPORT_GENERATED',
      eventDescription: `Partner export bundle generated (${events.length} events, checksum ${checksum})`,
      // Flat metadata (class-instance DTOs don't satisfy Prisma.InputJsonObject).
      metadata: {
        partnerKeyId: partner.keyId,
        partnerKeyPrefix: partner.keyPrefix,
        recordCount: events.length,
        filterEntityType: dto.entityType ?? null,
        filterEntityId: dto.entityId ?? null,
        filterFrom: dto.from ?? null,
        filterTo: dto.to ?? null,
      },
    });

    return payload;
  }

  /** Metadata-only listing of a tenant's past bundles. */
  listBundles(tenantId: string) {
    return this.prisma.evidenceExportBundle.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        recordCount: true,
        checksum: true,
        filters: true,
        status: true,
        expiresAt: true,
        createdAt: true,
      },
    });
  }

  /** Re-serve a frozen bundle. Tenant-scoped; expiry honoured. */
  async getBundle(tenantId: string, id: string): Promise<EvidenceExportBundlePayload> {
    const record = await this.prisma.evidenceExportBundle.findFirst({
      where: { id, tenantId },
    });
    if (!record) {
      throw new NotFoundException('Evidence export bundle not found');
    }
    if (
      record.status === 'EXPIRED' ||
      (record.expiresAt && record.expiresAt.getTime() < Date.now())
    ) {
      throw new NotFoundException('Evidence export bundle has expired');
    }
    return record.bundle as unknown as EvidenceExportBundlePayload;
  }

  /** Project an EvidenceEvent into the stable shape used in the bundle. */
  private project(e: EvidenceEvent): ProjectedEvidenceEvent {
    return {
      id: e.id,
      sequence: e.sequence,
      actorId: e.actorId,
      actorType: e.actorType,
      entityType: e.entityType,
      entityId: e.entityId,
      eventType: e.eventType,
      eventDescription: e.eventDescription,
      metadata: e.metadata,
      ipAddress: e.ipAddress,
      previousHash: e.previousHash,
      eventHash: e.eventHash,
      occurredAt: e.occurredAt.toISOString(),
      createdAt: e.createdAt.toISOString(),
    };
  }
}
