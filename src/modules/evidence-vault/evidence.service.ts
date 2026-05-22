import { Injectable } from '@nestjs/common';
import { EvidenceEvent, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { computeEventHash } from './evidence.hash';
import { AppendEvidenceInput, ChainVerification } from './evidence.types';

/**
 * The Evidence Vault — an append-only, hash-chained, tamper-evident event log.
 * Other modules call `append()` to record evidence-bearing actions; the chain
 * can later be verified to prove nothing was altered (PDF §35).
 */
@Injectable()
export class EvidenceService {
  constructor(private readonly prisma: PrismaService) {}

  /** Append one event to the tenant's tamper-evident chain. */
  async append(input: AppendEvidenceInput): Promise<EvidenceEvent> {
    const tenantId = input.tenantId ?? null;
    const tenantKey = tenantId ?? '__system__';
    const occurredAt = new Date();
    const metadata = input.metadata ?? null;

    return this.prisma.$transaction(async (tx) => {
      // Serialize appends per tenant so the chain cannot fork under concurrency.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${tenantKey}))`;

      const last = await tx.evidenceEvent.findFirst({
        where: { tenantId },
        orderBy: { sequence: 'desc' },
      });
      const previousHash = last?.eventHash ?? null;
      const sequence = (last?.sequence ?? 0) + 1;

      const eventHash = computeEventHash({
        sequence,
        tenantId,
        actorId: input.actorId ?? null,
        actorType: input.actorType ?? null,
        entityType: input.entityType,
        entityId: input.entityId,
        eventType: input.eventType,
        eventDescription: input.eventDescription,
        metadata,
        ipAddress: input.ipAddress ?? null,
        deviceId: input.deviceId ?? null,
        occurredAt,
        previousHash,
      });

      return tx.evidenceEvent.create({
        data: {
          tenantId,
          sequence,
          actorId: input.actorId ?? null,
          actorType: input.actorType ?? null,
          entityType: input.entityType,
          entityId: input.entityId,
          eventType: input.eventType,
          eventDescription: input.eventDescription,
          metadata: metadata === null ? Prisma.JsonNull : metadata,
          ipAddress: input.ipAddress ?? null,
          deviceId: input.deviceId ?? null,
          previousHash,
          eventHash,
          occurredAt,
        },
      });
    });
  }

  /** Read a tenant's evidence timeline, optionally filtered to one entity. */
  getTimeline(
    tenantId: string | null,
    filter: { entityType?: string; entityId?: string; limit?: number } = {},
  ): Promise<EvidenceEvent[]> {
    return this.prisma.evidenceEvent.findMany({
      where: {
        tenantId,
        ...(filter.entityType ? { entityType: filter.entityType } : {}),
        ...(filter.entityId ? { entityId: filter.entityId } : {}),
      },
      orderBy: { sequence: 'asc' },
      take: Math.min(filter.limit ?? 200, 500),
    });
  }

  /** Walk the tenant's chain and confirm no event was altered or re-linked. */
  async verifyChain(tenantId: string | null): Promise<ChainVerification> {
    const events = await this.prisma.evidenceEvent.findMany({
      where: { tenantId },
      orderBy: { sequence: 'asc' },
    });

    let previousHash: string | null = null;
    for (const e of events) {
      if (e.previousHash !== previousHash) {
        return {
          intact: false,
          totalEvents: events.length,
          brokenAtSequence: e.sequence,
          reason: 'Chain link broken — previousHash does not match the prior event.',
        };
      }
      const recomputed = computeEventHash({
        sequence: e.sequence,
        tenantId: e.tenantId,
        actorId: e.actorId,
        actorType: e.actorType,
        entityType: e.entityType,
        entityId: e.entityId,
        eventType: e.eventType,
        eventDescription: e.eventDescription,
        metadata: e.metadata,
        ipAddress: e.ipAddress,
        deviceId: e.deviceId,
        occurredAt: e.occurredAt,
        previousHash: e.previousHash,
      });
      if (recomputed !== e.eventHash) {
        return {
          intact: false,
          totalEvents: events.length,
          brokenAtSequence: e.sequence,
          reason: 'Event content has been altered since it was recorded.',
        };
      }
      previousHash = e.eventHash;
    }
    return { intact: true, totalEvents: events.length };
  }
}
