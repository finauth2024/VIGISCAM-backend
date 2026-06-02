import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/auth.types';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EvidenceService } from '../evidence-vault/evidence.service';
import { AddNoteDto } from './dto/add-note.dto';
import { CloseCaseDto } from './dto/close-case.dto';
import { CaseSeverity, CreateCaseDto } from './dto/create-case.dto';
import { LinkEntityDto } from './dto/link-entity.dto';
import { ListCasesQueryDto } from './dto/list-cases-query.dto';
import { CaseStatus, UpdateCaseDto } from './dto/update-case.dto';

/**
 * Investigator console (Phase 10D).
 *
 * Cases belong to an investigator/agency tenant. The console binds:
 *   - evidence_events by id (cross-tenant; the link IS the audit)
 *   - ScamCluster ids
 *   - free-form notes (append-only)
 *
 * Every mutating action writes a chain-of-custody event so the case's
 * provenance is reconstructable forever.
 */
@Injectable()
export class InvestigatorPortalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly evidence: EvidenceService,
  ) {}

  // ─── Case CRUD ─────────────────────────────────────────────────────────────

  async createCase(user: AuthenticatedUser, dto: CreateCaseDto) {
    const row = await this.prisma.investigatorCase.create({
      data: {
        tenantId: user.tenantId,
        title: dto.title,
        summary: dto.summary,
        severity: dto.severity ?? CaseSeverity.MEDIUM,
        status: 'OPEN',
        assignedToUserId: dto.assignedToUserId,
        createdByUserId: user.userId,
      },
    });

    const evidenceEvent = await this.evidence.append({
      tenantId: user.tenantId,
      actorId: user.userId,
      actorType: 'USER',
      entityType: 'INVESTIGATOR_CASE',
      entityId: row.id,
      eventType: 'INVESTIGATOR_CASE_CREATED',
      eventDescription: `Case "${dto.title}" opened`,
      metadata: { severity: row.severity, assignedToUserId: row.assignedToUserId ?? null },
    });

    return this.prisma.investigatorCase.update({
      where: { id: row.id },
      data: { evidenceEventId: evidenceEvent.id },
    });
  }

  async listCases(user: AuthenticatedUser, query: ListCasesQueryDto) {
    const limit = query.limit ?? 50;
    return this.prisma.investigatorCase.findMany({
      where: {
        tenantId: user.tenantId,
        ...(query.status ? { status: query.status } : {}),
        ...(query.severity ? { severity: query.severity } : {}),
        ...(query.assignedToUserId ? { assignedToUserId: query.assignedToUserId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async getCase(user: AuthenticatedUser, caseId: string) {
    const found = await this.prisma.investigatorCase.findUnique({
      where: { id: caseId },
      include: {
        evidenceLinks: { orderBy: { createdAt: 'desc' } },
        clusterLinks: { orderBy: { createdAt: 'desc' } },
        notes: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!found || found.tenantId !== user.tenantId) {
      throw new NotFoundException('Case not found');
    }
    return found;
  }

  async updateCase(user: AuthenticatedUser, caseId: string, dto: UpdateCaseDto) {
    const existing = await this.requireOpen(user, caseId);
    const updated = await this.prisma.investigatorCase.update({
      where: { id: caseId },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.summary !== undefined ? { summary: dto.summary } : {}),
        ...(dto.severity !== undefined ? { severity: dto.severity } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.assignedToUserId !== undefined ? { assignedToUserId: dto.assignedToUserId } : {}),
      },
    });
    await this.evidence.append({
      tenantId: user.tenantId,
      actorId: user.userId,
      actorType: 'USER',
      entityType: 'INVESTIGATOR_CASE',
      entityId: caseId,
      eventType: 'INVESTIGATOR_CASE_UPDATED',
      eventDescription: `Case updated`,
      metadata: {
        changes: { ...dto } as Record<string, unknown>,
        previousStatus: existing.status,
      } as never,
    });
    return updated;
  }

  // ─── Links ─────────────────────────────────────────────────────────────────

  async linkEvidence(user: AuthenticatedUser, caseId: string, dto: LinkEntityDto) {
    await this.requireOpen(user, caseId);
    try {
      const row = await this.prisma.investigatorCaseEvidence.create({
        data: {
          caseId,
          evidenceEventId: dto.entityId,
          linkedByUserId: user.userId,
          rationale: dto.rationale,
        },
      });
      await this.evidence.append({
        tenantId: user.tenantId,
        actorId: user.userId,
        actorType: 'USER',
        entityType: 'INVESTIGATOR_CASE',
        entityId: caseId,
        eventType: 'INVESTIGATOR_CASE_EVIDENCE_LINKED',
        eventDescription: `Evidence event ${dto.entityId} linked to case`,
        metadata: { evidenceEventId: dto.entityId, rationale: dto.rationale ?? null },
      });
      return row;
    } catch (err) {
      // Prisma P2002 = unique constraint violation. We surface as 400
      // so the caller can detect double-links without parsing Prisma codes.
      if ((err as { code?: string }).code === 'P2002') {
        throw new BadRequestException('Evidence already linked to this case');
      }
      throw err;
    }
  }

  async unlinkEvidence(user: AuthenticatedUser, caseId: string, linkId: string) {
    await this.requireOpen(user, caseId);
    const link = await this.prisma.investigatorCaseEvidence.findUnique({
      where: { id: linkId },
    });
    if (!link || link.caseId !== caseId) {
      throw new NotFoundException('Evidence link not found');
    }
    await this.prisma.investigatorCaseEvidence.delete({ where: { id: linkId } });
    await this.evidence.append({
      tenantId: user.tenantId,
      actorId: user.userId,
      actorType: 'USER',
      entityType: 'INVESTIGATOR_CASE',
      entityId: caseId,
      eventType: 'INVESTIGATOR_CASE_EVIDENCE_UNLINKED',
      eventDescription: `Evidence event ${link.evidenceEventId} unlinked from case`,
      metadata: { evidenceEventId: link.evidenceEventId },
    });
  }

  async linkCluster(user: AuthenticatedUser, caseId: string, dto: LinkEntityDto) {
    await this.requireOpen(user, caseId);
    try {
      const row = await this.prisma.investigatorCaseCluster.create({
        data: {
          caseId,
          clusterId: dto.entityId,
          linkedByUserId: user.userId,
          rationale: dto.rationale,
        },
      });
      await this.evidence.append({
        tenantId: user.tenantId,
        actorId: user.userId,
        actorType: 'USER',
        entityType: 'INVESTIGATOR_CASE',
        entityId: caseId,
        eventType: 'INVESTIGATOR_CASE_CLUSTER_LINKED',
        eventDescription: `ScamCluster ${dto.entityId} linked to case`,
        metadata: { clusterId: dto.entityId, rationale: dto.rationale ?? null },
      });
      return row;
    } catch (err) {
      if ((err as { code?: string }).code === 'P2002') {
        throw new BadRequestException('Cluster already linked to this case');
      }
      throw err;
    }
  }

  async unlinkCluster(user: AuthenticatedUser, caseId: string, linkId: string) {
    await this.requireOpen(user, caseId);
    const link = await this.prisma.investigatorCaseCluster.findUnique({
      where: { id: linkId },
    });
    if (!link || link.caseId !== caseId) {
      throw new NotFoundException('Cluster link not found');
    }
    await this.prisma.investigatorCaseCluster.delete({ where: { id: linkId } });
    await this.evidence.append({
      tenantId: user.tenantId,
      actorId: user.userId,
      actorType: 'USER',
      entityType: 'INVESTIGATOR_CASE',
      entityId: caseId,
      eventType: 'INVESTIGATOR_CASE_CLUSTER_UNLINKED',
      eventDescription: `ScamCluster ${link.clusterId} unlinked from case`,
      metadata: { clusterId: link.clusterId },
    });
  }

  // ─── Notes ─────────────────────────────────────────────────────────────────

  async addNote(user: AuthenticatedUser, caseId: string, dto: AddNoteDto) {
    await this.requireOpen(user, caseId);
    const row = await this.prisma.investigatorCaseNote.create({
      data: {
        caseId,
        authorUserId: user.userId,
        body: dto.body,
      },
    });
    const evidenceEvent = await this.evidence.append({
      tenantId: user.tenantId,
      actorId: user.userId,
      actorType: 'USER',
      entityType: 'INVESTIGATOR_CASE',
      entityId: caseId,
      eventType: 'INVESTIGATOR_CASE_NOTE_ADDED',
      eventDescription: `Note added to case (${dto.body.length} chars)`,
      metadata: { noteId: row.id, length: dto.body.length },
    });
    return this.prisma.investigatorCaseNote.update({
      where: { id: row.id },
      data: { evidenceEventId: evidenceEvent.id },
    });
  }

  // ─── Close ─────────────────────────────────────────────────────────────────

  async closeCase(user: AuthenticatedUser, caseId: string, dto: CloseCaseDto) {
    await this.requireOpen(user, caseId);
    const closedAt = new Date();
    const updated = await this.prisma.investigatorCase.update({
      where: { id: caseId },
      data: {
        status: CaseStatus.CLOSED,
        closedAt,
        disposition: dto.disposition,
      },
    });
    await this.evidence.append({
      tenantId: user.tenantId,
      actorId: user.userId,
      actorType: 'USER',
      entityType: 'INVESTIGATOR_CASE',
      entityId: caseId,
      eventType: 'INVESTIGATOR_CASE_CLOSED',
      eventDescription: `Case closed with disposition ${dto.disposition}`,
      metadata: { disposition: dto.disposition, notes: dto.notes ?? null },
    });
    return updated;
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private async requireOpen(user: AuthenticatedUser, caseId: string) {
    const found = await this.prisma.investigatorCase.findUnique({
      where: { id: caseId },
      select: { id: true, tenantId: true, status: true },
    });
    if (!found || found.tenantId !== user.tenantId) {
      throw new NotFoundException('Case not found');
    }
    if (found.status === 'CLOSED') {
      throw new BadRequestException('Case is closed — reopen before mutating');
    }
    return found;
  }
}
