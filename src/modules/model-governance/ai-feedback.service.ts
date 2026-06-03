import { Injectable, NotFoundException } from '@nestjs/common';
import { AIDecision, AIDecisionReviewStatus, AIReviewerLabel, Prisma } from '@prisma/client';
import { AuthenticatedUser } from '../../common/auth/auth.types';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SubmitAiFeedbackDto } from './dto/submit-ai-feedback.dto';

/** Low-confidence decisions are surfaced for review even without an explicit flag. */
const REVIEW_CONFIDENCE_THRESHOLD = 55;

const LABEL_TO_STATUS: Record<AIReviewerLabel, AIDecisionReviewStatus> = {
  CONFIRMED_CORRECT: 'CONFIRMED',
  INCONCLUSIVE_ACCEPTED: 'CONFIRMED',
  FALSE_POSITIVE: 'CORRECTED',
  FALSE_NEGATIVE: 'CORRECTED',
  CORRECTED_CATEGORY: 'CORRECTED',
};

/**
 * CP-7 — the AI reviewer feedback loop (reviewer #7). Reviewers see the AI
 * decisions that need human review, then confirm or correct them. Each decision
 * recorded into the model_feedback table is the labelled substrate for active
 * learning / retraining, and rolls up into per-model evaluation metrics.
 */
@Injectable()
export class AiFeedbackService {
  constructor(private readonly prisma: PrismaService) {}

  /** Decisions awaiting review: flagged requiresHumanReview OR low-confidence. */
  listForReview(serviceKind?: string, limit = 100): Promise<AIDecision[]> {
    return this.prisma.aIDecision.findMany({
      where: {
        reviewStatus: 'PENDING',
        ...(serviceKind ? { serviceKind } : {}),
        OR: [
          { requiresHumanReview: true },
          { confidence: { lt: REVIEW_CONFIDENCE_THRESHOLD } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 500),
    });
  }

  async submitFeedback(
    user: AuthenticatedUser,
    decisionId: string,
    dto: SubmitAiFeedbackDto,
  ): Promise<AIDecision> {
    const decision = await this.prisma.aIDecision.findUnique({ where: { id: decisionId } });
    if (!decision) throw new NotFoundException('AI decision not found');

    const reviewStatus = LABEL_TO_STATUS[dto.label];

    const [updated] = await this.prisma.$transaction([
      this.prisma.aIDecision.update({
        where: { id: decisionId },
        data: {
          reviewStatus,
          reviewerLabel: dto.label,
          reviewedByUserId: user.userId,
          reviewedAt: new Date(),
          reviewNotes: dto.notes ?? null,
        },
      }),
      this.prisma.modelFeedback.create({
        data: {
          aiDecisionId: decision.id,
          serviceKind: decision.serviceKind,
          modelVersion: decision.modelVersion,
          reviewerLabel: dto.label,
          correctedOutput: (dto.correctedOutput ?? undefined) as never,
          notes: dto.notes ?? null,
          reviewedByUserId: user.userId,
        },
      }),
      this.prisma.auditLog.create({
        data: {
          actorId: user.userId,
          actorType: 'REVIEWER',
          action: 'AI_DECISION_REVIEWED',
          targetType: 'AI_DECISION',
          targetId: decision.id,
          metadata: { label: dto.label, serviceKind: decision.serviceKind, reviewStatus },
        },
      }),
    ]);
    return updated;
  }

  /**
   * Per-model evaluation metrics rolled up from reviewer feedback: counts per
   * label + the implied false-positive / false-negative rates.
   */
  async feedbackStats(serviceKind?: string): Promise<
    Array<{
      serviceKind: string;
      modelVersion: string;
      total: number;
      labels: Record<string, number>;
      falsePositiveRate: number;
      falseNegativeRate: number;
    }>
  > {
    const grouped = await this.prisma.modelFeedback.groupBy({
      by: ['serviceKind', 'modelVersion', 'reviewerLabel'],
      where: serviceKind ? { serviceKind } : {},
      _count: { _all: true },
    });

    const byModel = new Map<
      string,
      { serviceKind: string; modelVersion: string; labels: Record<string, number> }
    >();
    for (const g of grouped) {
      const key = `${g.serviceKind}::${g.modelVersion}`;
      const entry =
        byModel.get(key) ??
        { serviceKind: g.serviceKind, modelVersion: g.modelVersion, labels: {} };
      entry.labels[g.reviewerLabel] = (g.reviewerLabel ? g._count._all : 0) as number;
      byModel.set(key, entry);
    }

    return [...byModel.values()].map((m) => {
      const total = Object.values(m.labels).reduce((a, b) => a + b, 0);
      const fp = m.labels.FALSE_POSITIVE ?? 0;
      const fn = m.labels.FALSE_NEGATIVE ?? 0;
      return {
        serviceKind: m.serviceKind,
        modelVersion: m.modelVersion,
        total,
        labels: m.labels,
        falsePositiveRate: total ? Number((fp / total).toFixed(3)) : 0,
        falseNegativeRate: total ? Number((fn / total).toFixed(3)) : 0,
      };
    });
  }
}
