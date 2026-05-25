import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ScamSignalStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * Tenant-scoped read APIs for partners (PDF §43, docs/04 §4 purpose
 * limitation). Every query is filtered by the partner's tenantId — there is
 * no code path here that can return another tenant's data. Internal reviewer
 * notes (logged with tenantId=null) are likewise never exposed.
 */
@Injectable()
export class PartnerIntelligenceService {
  constructor(private readonly prisma: PrismaService) {}

  /** List the signals submitted by this partner tenant. */
  listSignals(tenantId: string, status?: string, limit = 100) {
    const where: Prisma.ScamSignalWhereInput = { tenantId };
    if ((Object.values(ScamSignalStatus) as string[]).includes(status ?? '')) {
      where.status = status as ScamSignalStatus;
    }
    return this.prisma.scamSignal.findMany({
      where,
      orderBy: { lastSeen: 'desc' },
      take: Math.min(Math.max(limit, 1), 200),
      select: {
        id: true,
        sourceType: true,
        indicatorType: true,
        indicatorValue: true,
        normalizedIndicator: true,
        category: true,
        description: true,
        status: true,
        reportCount: true,
        confidenceScore: true,
        firstSeen: true,
        lastSeen: true,
        clusterId: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  /** Get a single signal — 404 if it is not this tenant's. */
  async getSignal(tenantId: string, id: string) {
    // A composite where keeps tenant isolation tight: if the signal exists
    // but belongs to another tenant, findFirst returns null and we 404,
    // never leaking its existence.
    const signal = await this.prisma.scamSignal.findFirst({
      where: { id, tenantId },
      include: {
        cluster: {
          select: {
            id: true,
            label: true,
            matchType: true,
            status: true,
            signalCount: true,
            confidenceScore: true,
            firstSeen: true,
            lastSeen: true,
          },
        },
      },
    });
    if (!signal) {
      throw new NotFoundException('Scam signal not found');
    }
    return signal;
  }

  /**
   * List the partner tenant's Evidence Vault events. Optional filter to a
   * specific entity (e.g. one of the tenant's own signals). Only events
   * tagged with this tenantId are returned — internal reviewer events (which
   * are recorded with tenantId=null) stay invisible.
   */
  listEvidence(
    tenantId: string,
    filters: { entityType?: string; entityId?: string } = {},
    limit = 200,
  ) {
    const where: Prisma.EvidenceEventWhereInput = { tenantId };
    if (filters.entityType) {
      where.entityType = filters.entityType;
    }
    if (filters.entityId) {
      where.entityId = filters.entityId;
    }
    return this.prisma.evidenceEvent.findMany({
      where,
      orderBy: { sequence: 'desc' },
      take: Math.min(Math.max(limit, 1), 500),
      select: {
        id: true,
        sequence: true,
        actorType: true,
        entityType: true,
        entityId: true,
        eventType: true,
        eventDescription: true,
        metadata: true,
        previousHash: true,
        eventHash: true,
        occurredAt: true,
      },
    });
  }
}
