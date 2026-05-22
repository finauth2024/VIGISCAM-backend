import { Injectable, NotFoundException } from '@nestjs/common';
import { RegistryReviewQueue, ScamSignal, ScamSignalStatus, ReviewQueueStatus } from '@prisma/client';
import { AuthenticatedUser, RequestContext } from '../../common/auth/auth.types';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EvidenceService } from '../evidence-vault/evidence.service';
import { ReviewDecision, ReviewSignalDto } from './dto/review-signal.dto';

/** Maps a reviewer decision to the scam-signal status it sets. */
const DECISION_STATUS: Record<ReviewDecision, ScamSignalStatus> = {
  [ReviewDecision.MARK_UNDER_REVIEW]: 'UNDER_REVIEW',
  [ReviewDecision.MARK_HIGH_RISK]: 'HIGH_RISK_INDICATOR',
  [ReviewDecision.PROMOTE_TO_VERIFIED]: 'VERIFIED_SCAM_INTELLIGENCE',
  [ReviewDecision.REJECT]: 'REJECTED',
  [ReviewDecision.ARCHIVE]: 'ARCHIVED',
};

/**
 * The internal review workflow (PDF §16.2). Reviewers triage queued signals,
 * record notes and a decision, and every review action is written to the
 * tamper-evident Evidence Vault. None of this is ever visible to the public.
 */
@Injectable()
export class ReviewQueueService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly evidence: EvidenceService,
  ) {}

  /** List queue items, each with a light summary of its signal. */
  async list(status?: string) {
    const valid = (Object.values(ReviewQueueStatus) as string[]).includes(status ?? '');
    const items = await this.prisma.registryReviewQueue.findMany({
      where: valid ? { reviewStatus: status as ReviewQueueStatus } : {},
      orderBy: { createdAt: 'asc' },
      take: 200,
    });

    const signalIds = items
      .map((i) => i.signalId)
      .filter((id): id is string => id !== null);
    const signals = signalIds.length
      ? await this.prisma.scamSignal.findMany({ where: { id: { in: signalIds } } })
      : [];
    const byId = new Map(signals.map((s) => [s.id, s]));

    return items.map((item) => ({
      ...item,
      signal:
        item.signalId && byId.has(item.signalId)
          ? this.signalSummary(byId.get(item.signalId)!)
          : null,
    }));
  }

  /** A reviewer claims a queue item. */
  async assign(
    reviewer: AuthenticatedUser,
    queueId: string,
    ctx: RequestContext = {},
  ): Promise<RegistryReviewQueue> {
    await this.requireItem(queueId);
    const updated = await this.prisma.registryReviewQueue.update({
      where: { id: queueId },
      data: { assignedToUserId: reviewer.userId, reviewStatus: 'IN_REVIEW' },
    });
    await this.evidence.append({
      tenantId: null,
      actorId: reviewer.userId,
      actorType: 'REVIEWER',
      entityType: 'REVIEW_QUEUE_ITEM',
      entityId: queueId,
      eventType: 'REVIEW_STARTED',
      eventDescription: 'Reviewer claimed a review-queue item',
      ipAddress: ctx.ip ?? null,
    });
    return updated;
  }

  /** Apply a reviewer decision to a signal and close out its queue item. */
  async reviewSignal(
    reviewer: AuthenticatedUser,
    signalId: string,
    dto: ReviewSignalDto,
    ctx: RequestContext = {},
  ) {
    const signal = await this.prisma.scamSignal.findUnique({ where: { id: signalId } });
    if (!signal) {
      throw new NotFoundException('Scam signal not found');
    }

    const newStatus = DECISION_STATUS[dto.decision];
    const promoted = dto.decision === ReviewDecision.PROMOTE_TO_VERIFIED;

    const updatedSignal = await this.prisma.scamSignal.update({
      where: { id: signalId },
      data: {
        status: newStatus,
        publicSafeCandidate: promoted ? true : signal.publicSafeCandidate,
      },
    });

    const openItem = await this.prisma.registryReviewQueue.findFirst({
      where: { signalId, reviewStatus: { not: 'COMPLETED' } },
      orderBy: { createdAt: 'desc' },
    });
    const reviewItem = openItem
      ? await this.prisma.registryReviewQueue.update({
          where: { id: openItem.id },
          data: {
            reviewStatus: 'COMPLETED',
            assignedToUserId: reviewer.userId,
            reviewNotes: dto.notes,
            decision: dto.decision,
            publicSafe: promoted,
          },
        })
      : await this.prisma.registryReviewQueue.create({
          data: {
            signalId,
            reviewStatus: 'COMPLETED',
            assignedToUserId: reviewer.userId,
            reviewNotes: dto.notes,
            decision: dto.decision,
            publicSafe: promoted,
          },
        });

    await this.evidence.append({
      tenantId: null,
      actorId: reviewer.userId,
      actorType: 'REVIEWER',
      entityType: 'SCAM_SIGNAL',
      entityId: signalId,
      eventType: 'REVIEW_COMPLETED',
      eventDescription: `Reviewer decision ${dto.decision} — signal status set to ${newStatus}`,
      metadata: { decision: dto.decision, newStatus, notes: dto.notes ?? null },
      ipAddress: ctx.ip ?? null,
    });

    return { signal: updatedSignal, reviewItem };
  }

  private signalSummary(s: ScamSignal) {
    return {
      id: s.id,
      indicatorType: s.indicatorType,
      indicatorValue: s.indicatorValue,
      status: s.status,
      confidenceScore: s.confidenceScore,
      reportCount: s.reportCount,
    };
  }

  private async requireItem(id: string): Promise<RegistryReviewQueue> {
    const item = await this.prisma.registryReviewQueue.findUnique({ where: { id } });
    if (!item) {
      throw new NotFoundException('Review-queue item not found');
    }
    return item;
  }
}
