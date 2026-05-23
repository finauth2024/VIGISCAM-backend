import { Injectable } from '@nestjs/common';
import { DetectionRuleStatus, TakedownStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface IntelligenceMetrics {
  generatedAt: string;
  signals: {
    newToday: number;
    underReview: number;
    suspicious: number;
    verified: number;
    userReports: number;
    partnerReports: number;
  };
  clusters: {
    active: number;
    highRisk: number;
  };
  registry: {
    candidates: number;
    awaitingPublication: number;
    published: number;
  };
  rules: {
    draft: number;
    testing: number;
    active: number;
    disabled: number;
    retired: number;
    updatedToday: number;
  };
  appeals: {
    submitted: number;
    underReview: number;
  };
  takedowns: {
    open: number;
    completed: number;
    rejected: number;
    successRatePct: number | null;
  };
}

/**
 * Backend for the internal intelligence dashboard (PDF §29.4, §36). One
 * endpoint, many counts — assembled in parallel so the page stays snappy.
 * Internal-only; nothing here is ever a public surface.
 */
@Injectable()
export class IntelligenceMetricsService {
  constructor(private readonly prisma: PrismaService) {}

  async getMetrics(): Promise<IntelligenceMetrics> {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [
      newSignalsToday,
      signalsUnderReview,
      suspiciousSignals,
      verifiedSignals,
      userReports,
      partnerReports,
      activeClusters,
      highRiskClusters,
      registryCandidates,
      registryAwaitingPublication,
      registryPublished,
      rulesByStatus,
      rulesUpdatedToday,
      appealsSubmitted,
      appealsUnderReview,
      takedownsByStatus,
    ] = await Promise.all([
      this.prisma.scamSignal.count({ where: { createdAt: { gte: oneDayAgo } } }),
      this.prisma.scamSignal.count({ where: { status: 'UNDER_REVIEW' } }),
      this.prisma.scamSignal.count({
        where: { status: { in: ['SUSPICIOUS_SIGNAL', 'PATTERN_MATCH'] } },
      }),
      this.prisma.scamSignal.count({ where: { status: 'VERIFIED_SCAM_INTELLIGENCE' } }),
      this.prisma.scamSignal.count({ where: { sourceType: 'USER_REPORT' } }),
      this.prisma.scamSignal.count({
        where: { sourceType: { in: ['PARTNER_REPORT', 'BANK_REPORT'] } },
      }),
      this.prisma.scamCluster.count({ where: { status: 'ACTIVE' } }),
      // HIGH risk band starts at confidence >= 61 (see risk.scoring.levelForScore).
      this.prisma.scamCluster.count({
        where: { status: 'ACTIVE', confidenceScore: { gte: 61 } },
      }),
      this.prisma.registryEntry.count({ where: { status: 'CANDIDATE' } }),
      this.prisma.registryEntry.count({ where: { status: 'APPROVED_PUBLIC_SAFE' } }),
      this.prisma.registryEntry.count({ where: { status: 'PUBLISHED' } }),
      this.prisma.detectionRule.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.detectionRule.count({ where: { updatedAt: { gte: oneDayAgo } } }),
      this.prisma.registryAppeal.count({ where: { status: 'SUBMITTED' } }),
      this.prisma.registryAppeal.count({ where: { status: 'UNDER_REVIEW' } }),
      this.prisma.takedownRequest.groupBy({ by: ['status'], _count: { _all: true } }),
    ]);

    const rulesCount = (s: DetectionRuleStatus): number =>
      rulesByStatus.find((r) => r.status === s)?._count._all ?? 0;
    const takedownCount = (s: TakedownStatus): number =>
      takedownsByStatus.find((t) => t.status === s)?._count._all ?? 0;

    const completed = takedownCount('COMPLETED');
    const rejected = takedownCount('REJECTED');
    const resolved = completed + rejected;
    const open =
      takedownCount('DRAFT') +
      takedownCount('SUBMITTED') +
      takedownCount('ACKNOWLEDGED') +
      takedownCount('IN_PROGRESS');

    return {
      generatedAt: new Date().toISOString(),
      signals: {
        newToday: newSignalsToday,
        underReview: signalsUnderReview,
        suspicious: suspiciousSignals,
        verified: verifiedSignals,
        userReports,
        partnerReports,
      },
      clusters: {
        active: activeClusters,
        highRisk: highRiskClusters,
      },
      registry: {
        candidates: registryCandidates,
        awaitingPublication: registryAwaitingPublication,
        published: registryPublished,
      },
      rules: {
        draft: rulesCount('DRAFT'),
        testing: rulesCount('TESTING'),
        active: rulesCount('ACTIVE'),
        disabled: rulesCount('DISABLED'),
        retired: rulesCount('RETIRED'),
        updatedToday: rulesUpdatedToday,
      },
      appeals: {
        submitted: appealsSubmitted,
        underReview: appealsUnderReview,
      },
      takedowns: {
        open,
        completed,
        rejected,
        successRatePct: resolved > 0 ? Math.round((completed / resolved) * 100) : null,
      },
    };
  }
}
