import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ClaimVerification, ClaimVerifyDecision } from '@prisma/client';
import { AuthenticatedUser } from '../../common/auth/auth.types';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EvidenceService } from '../evidence-vault/evidence.service';
import { GuardianPauseService } from '../guardian-pause/guardian-pause.service';
import {
  DecisionKind,
  ProtectionEnforcementService,
} from '../protection-settings/protection-enforcement.service';
import { RiskEventRecorderService } from '../risk-events/risk-event-recorder.service';
import { ScamSignalsService } from '../scam-signals/scam-signals.service';
import { TrustedContactReviewService } from '../trusted-contact-review/trusted-contact-review.service';
import { extractClaimIndicators } from './claim-indicators';
import { ClaimVerifyUserDecision, DecideClaimDto } from './dto/decide-claim.dto';
import { VerifyClaimDto } from './dto/verify-claim.dto';
import { scoreClaimVerify } from './claimverify.scoring';

/**
 * ClaimVerify AI™ (Phase 9E). Scores a stranger's claim against
 * subject signals and verbal-pressure context. HIGH/CRITICAL pulls
 * Guardian Pause (9A) with a SUSPICIOUS_CLAIM trigger.
 *
 * Phase 11B wires the suspicious-claim → ScamPulse signal feed; for
 * now we log the intent so the path is observable.
 */
@Injectable()
export class ClaimVerifyService {
  private readonly logger = new Logger(ClaimVerifyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly evidence: EvidenceService,
    private readonly guardianPause: GuardianPauseService,
    private readonly trustedContactReview: TrustedContactReviewService,
    private readonly enforcement: ProtectionEnforcementService,
    private readonly riskEvents: RiskEventRecorderService,
    private readonly scamSignals: ScamSignalsService,
  ) {}

  /** Map a ClaimVerify claim type onto a ScamPulse scam-category code. */
  private claimCategory(claimType: string): string | undefined {
    const map: Record<string, string> = {
      INVESTMENT: 'INVESTMENT_SCAM',
      ROMANCE: 'ROMANCE_SCAM',
      CHARITY: 'DONATION_SCAM',
      GOVERNMENT: 'GOVERNMENT_IMPERSONATION',
      JOB: 'FAKE_JOB_SCAM',
      WORK_FROM_HOME: 'FAKE_JOB_SCAM',
    };
    return map[claimType];
  }

  async verify(user: AuthenticatedUser, dto: VerifyClaimDto): Promise<ClaimVerification> {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const priorWarnings = await this.prisma.claimVerification.count({
      where: {
        userId: user.userId,
        decision: 'CONTINUED_ANYWAY',
        createdAt: { gte: thirtyDaysAgo },
      },
    });

    const scoring = scoreClaimVerify({
      claimType: dto.claimType,
      domainAgeDays: dto.domainAgeDays,
      locationMismatch: dto.locationMismatch,
      imageReuseDetected: dto.imageReuseDetected,
      scamPhraseScore: dto.scamPhraseScore,
      paymentPressure: dto.paymentPressure,
      secrecyDetected: dto.secrecyDetected,
      urgencyDetected: dto.urgencyDetected,
      priorWarningsCount: priorWarnings,
    });

    const created = await this.prisma.claimVerification.create({
      data: {
        userId: user.userId,
        tenantId: user.tenantId,
        claimType: dto.claimType,
        subject: dto.subject as never,
        domainAgeDays: dto.domainAgeDays ?? null,
        locationMismatch: dto.locationMismatch ?? false,
        imageReuseDetected: dto.imageReuseDetected ?? false,
        scamPhraseScore: typeof dto.scamPhraseScore === 'number' ? dto.scamPhraseScore : null,
        paymentPressure: dto.paymentPressure ?? false,
        secrecyDetected: dto.secrecyDetected ?? false,
        urgencyDetected: dto.urgencyDetected ?? false,
        priorWarningsCount: priorWarnings,
        riskScore: scoring.score,
        riskLevel: scoring.level,
        riskBreakdown: scoring.breakdown as never,
        metadata: dto.metadata as never,
      },
    });

    const evidence = await this.evidence.append({
      tenantId: user.tenantId,
      actorId: user.userId,
      actorType: 'USER',
      entityType: 'CLAIM_VERIFICATION',
      entityId: created.id,
      eventType: 'CLAIM_VERIFICATION_OPENED',
      eventDescription: `ClaimVerify ${dto.claimType}: ${scoring.level} (score ${scoring.score})`,
      metadata: {
        claimType: dto.claimType,
        riskScore: scoring.score,
        riskLevel: scoring.level,
        breakdown: scoring.breakdown,
        // The subject lives on the row; mirroring it into the evidence
        // metadata would duplicate PII across the audit summary.
      },
    });

    let guardianPauseId: string | null = null;
    if (scoring.level === 'HIGH' || scoring.level === 'CRITICAL') {
      const pause = await this.guardianPause.start(user, {
        riskLevel: scoring.level,
        triggerType: 'SUSPICIOUS_CLAIM',
        triggerSummary: `Claim type ${dto.claimType.toLowerCase().replace('_', ' ')} flagged as ${scoring.level} risk`,
        durationSeconds: 90,
        metadata: { claimVerificationId: created.id },
      });
      guardianPauseId = pause.id;

      // CP-5 — feed the suspicious claim into ScamPulse signal intake so the
      // intelligence layer sees this pattern across users. Indicators are
      // extracted from the (structured) subject; each goes through the private
      // intake engine (deduped, scored, clustered, Evidence-Vault-logged, and
      // routed to the review queue when high-risk). NEVER auto-verified or
      // public. Best-effort — a failed intake must not break the user's check.
      const indicators = extractClaimIndicators(dto.subject);
      for (const ind of indicators) {
        try {
          const signal = await this.scamSignals.submitFromModule({
            dto: {
              indicatorType: ind.indicatorType,
              indicatorValue: ind.indicatorValue,
              category: this.claimCategory(dto.claimType),
              description: `Suspicious ${dto.claimType.toLowerCase().replace('_', ' ')} claim flagged by ClaimVerify (${scoring.level}).`,
            },
            tenantId: user.tenantId,
            submittedByUserId: user.userId,
            sourceModule: 'CLAIMVERIFY',
          });
          this.logger.log(
            `Claim ${created.id}: fed ${ind.indicatorType} indicator into ScamPulse (signal ${signal.id}).`,
          );
        } catch (err: unknown) {
          this.logger.warn(`Claim ${created.id}: ScamPulse intake failed: ${String(err)}`);
        }
      }
    }

    // CP-3 — every module emits a unified RiskEvent.
    await this.riskEvents.record(user, {
      moduleSource: 'CLAIMVERIFY',
      eventType: 'CLAIMVERIFY_VERIFY',
      riskScore: scoring.score,
      riskLevel: scoring.level,
      triggerReason: `Claim verification flagged as ${scoring.level} risk`,
      recommendedAction:
        scoring.level === 'CRITICAL'
          ? 'DO_NOT_PROCEED'
          : scoring.level === 'HIGH'
            ? 'VERIFY_BEFORE_PROCEEDING'
            : 'PROCEED_WITH_CAUTION',
      metadata: { claimVerificationId: created.id, evidenceEventId: evidence.id },
    });

    return this.prisma.claimVerification.update({
      where: { id: created.id },
      data: {
        evidenceEventId: evidence.id,
        guardianPauseEventId: guardianPauseId,
      },
    });
  }

  async decide(
    user: AuthenticatedUser,
    verificationId: string,
    dto: DecideClaimDto,
  ): Promise<ClaimVerification> {
    const existing = await this.prisma.claimVerification.findFirst({
      where: { id: verificationId, userId: user.userId },
    });
    if (!existing) {
      throw new NotFoundException('Claim verification not found');
    }
    if (existing.decision !== ('PENDING' as ClaimVerifyDecision)) {
      throw new BadRequestException(`Claim already decided (${existing.decision})`);
    }


    // CP-2 enforcement (Elder Mode / trusted-contact).
    const decisionKind: DecisionKind =
      dto.decision === ClaimVerifyUserDecision.CONTINUED_ANYWAY
        ? 'CONTINUE'
        : dto.decision === ClaimVerifyUserDecision.TRUSTED
          ? 'RELEASE'
          : 'OTHER';
    await this.enforcement.enforceDecision(user, {
      module: 'CLAIMVERIFY',
      eventId: existing.id,
      riskLevel: existing.riskLevel,
      amountMinor: undefined,
      decisionKind,
    });

    const nextDecision = dto.decision as unknown as ClaimVerifyDecision;
    const updated = await this.prisma.claimVerification.update({
      where: { id: existing.id },
      data: {
        decision: nextDecision,
        decidedAt: new Date(),
        decisionNotes: dto.notes ?? null,
      },
    });

    await this.evidence.append({
      tenantId: user.tenantId,
      actorId: user.userId,
      actorType: 'USER',
      entityType: 'CLAIM_VERIFICATION',
      entityId: existing.id,
      eventType: `CLAIM_VERIFICATION_${dto.decision}`,
      eventDescription:
        dto.decision === ClaimVerifyUserDecision.CONTINUED_ANYWAY
          ? 'User continued past claim warning'
          : `Claim verification resolved: ${dto.decision}`,
      metadata: { decision: dto.decision, notes: dto.notes ?? null },
    });

    if (dto.decision === ClaimVerifyUserDecision.ESCALATED_TO_TRUSTED_CONTACT) {
      const review = await this.trustedContactReview.requestReview({
        user,
        triggerModule: 'CLAIMVERIFY',
        triggerEventId: existing.id,
        triggerSummary:
          `Claim of type ${existing.claimType.toLowerCase().replace('_', ' ')} ` +
          `flagged as ${existing.riskLevel} risk`,
        metadata: { claimVerificationId: existing.id },
      });
      if (review) {
        await this.prisma.claimVerification.update({
          where: { id: existing.id },
          data: { trustedContactReviewId: review.id },
        });
      } else {
        this.logger.warn(
          `Claim verification ${existing.id}: no eligible trusted contact — escalation acknowledged but unrouted`,
        );
      }
    }

    return updated;
  }

  history(user: AuthenticatedUser, limit = 50): Promise<ClaimVerification[]> {
    return this.prisma.claimVerification.findMany({
      where: { userId: user.userId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 200),
    });
  }
}
