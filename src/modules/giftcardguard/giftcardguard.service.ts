import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { GiftCardGuardDecision, GiftCardWarning } from '@prisma/client';
import { AuthenticatedUser } from '../../common/auth/auth.types';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EvidenceService } from '../evidence-vault/evidence.service';
import { GuardianPauseService } from '../guardian-pause/guardian-pause.service';
import {
  DecisionKind,
  ProtectionEnforcementService,
} from '../protection-settings/protection-enforcement.service';
import { RiskEventRecorderService } from '../risk-events/risk-event-recorder.service';
import { TrustedContactReviewService } from '../trusted-contact-review/trusted-contact-review.service';
import { DecideGiftCardDto, GiftCardGuardUserDecision } from './dto/decide-giftcard.dto';
import { ScanGiftCardDto } from './dto/scan-giftcard.dto';
import { scoreGiftCardGuard } from './giftcardguard.scoring';

/**
 * GiftCardGuard™ (Phase 9C). Detects gift-card scam attempts and
 * escalates them based on context (impersonation, urgency, secrecy,
 * code-reveal asks, Elder Mode).
 *
 * Cross-module wiring:
 *  - HIGH or CRITICAL risk → Guardian Pause (9A) opens with a
 *    GIFT_CARD_REVEAL trigger.
 *  - Decision `ESCALATED_TO_TRUSTED_CONTACT` will fire the 9H
 *    trusted-contact workflow when that lands (TODO marker today).
 */
@Injectable()
export class GiftCardGuardService {
  private readonly logger = new Logger(GiftCardGuardService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly evidence: EvidenceService,
    private readonly guardianPause: GuardianPauseService,
    private readonly trustedContactReview: TrustedContactReviewService,
    private readonly enforcement: ProtectionEnforcementService,
    private readonly riskEvents: RiskEventRecorderService,
  ) {}

  async scan(user: AuthenticatedUser, dto: ScanGiftCardDto): Promise<GiftCardWarning> {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const priorWarnings = await this.prisma.giftCardWarning.count({
      where: {
        userId: user.userId,
        decision: 'CONTINUED_ANYWAY',
        createdAt: { gte: thirtyDaysAgo },
      },
    });

    const scoring = scoreGiftCardGuard({
      codeRevealRequested: dto.codeRevealRequested,
      photoOfCodeRequested: dto.photoOfCodeRequested,
      impersonationType: dto.impersonationType,
      urgencyDetected: dto.urgencyDetected,
      secrecyDetected: dto.secrecyDetected,
      elderModeActive: dto.elderModeActive,
      priorWarningsCount: priorWarnings,
    });

    const created = await this.prisma.giftCardWarning.create({
      data: {
        userId: user.userId,
        tenantId: user.tenantId,
        cardBrand: dto.cardBrand ?? null,
        denominationMinor:
          dto.denominationMinor !== undefined ? BigInt(dto.denominationMinor) : null,
        currency: dto.currency ?? 'USD',
        codeRevealRequested: dto.codeRevealRequested ?? false,
        photoOfCodeRequested: dto.photoOfCodeRequested ?? false,
        impersonationType: dto.impersonationType ?? 'NONE',
        urgencyDetected: dto.urgencyDetected ?? false,
        secrecyDetected: dto.secrecyDetected ?? false,
        elderModeActive: dto.elderModeActive ?? false,
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
      entityType: 'GIFTCARD_WARNING',
      entityId: created.id,
      eventType: 'GIFTCARD_WARNING_OPENED',
      eventDescription: `GiftCardGuard scan: ${scoring.level} (score ${scoring.score})`,
      metadata: {
        riskScore: scoring.score,
        riskLevel: scoring.level,
        breakdown: scoring.breakdown,
        cardBrand: dto.cardBrand ?? null,
      },
    });

    // HIGH or CRITICAL → pull Guardian Pause. Threshold lower than 9B
    // because once a gift-card pattern is HIGH (≥ 61), the legitimate-
    // use rate is near-zero — we always want the user to stop.
    let guardianPauseId: string | null = null;
    if (scoring.level === 'HIGH' || scoring.level === 'CRITICAL') {
      const pause = await this.guardianPause.start(user, {
        riskLevel: scoring.level === 'CRITICAL' ? 'CRITICAL' : 'HIGH',
        triggerType: 'GIFT_CARD_REVEAL',
        triggerSummary:
          dto.impersonationType && dto.impersonationType !== 'NONE'
            ? `Gift card requested by someone claiming ${dto.impersonationType.toLowerCase().replace('_', ' ')}`
            : 'Gift card request flagged as high-risk',
        durationSeconds: 90,
        metadata: { giftCardWarningId: created.id },
      });
      guardianPauseId = pause.id;
    }

    // CP-3 — every module emits a unified RiskEvent.
    await this.riskEvents.record(user, {
      moduleSource: 'GIFTCARDGUARD',
      eventType: 'GIFTCARDGUARD_SCAN',
      riskScore: scoring.score,
      riskLevel: scoring.level,
      triggerReason: `Gift card request flagged as ${scoring.level} risk`,
      recommendedAction:
        scoring.level === 'CRITICAL'
          ? 'DO_NOT_PROCEED'
          : scoring.level === 'HIGH'
            ? 'VERIFY_BEFORE_PROCEEDING'
            : 'PROCEED_WITH_CAUTION',
      metadata: { giftCardWarningId: created.id, evidenceEventId: evidence.id },
    });

    return this.prisma.giftCardWarning.update({
      where: { id: created.id },
      data: {
        evidenceEventId: evidence.id,
        guardianPauseEventId: guardianPauseId,
      },
    });
  }

  async decide(
    user: AuthenticatedUser,
    warningId: string,
    dto: DecideGiftCardDto,
  ): Promise<GiftCardWarning> {
    const existing = await this.prisma.giftCardWarning.findFirst({
      where: { id: warningId, userId: user.userId },
    });
    if (!existing) {
      throw new NotFoundException('Gift card warning not found');
    }
    if (existing.decision !== ('PENDING' as GiftCardGuardDecision)) {
      throw new BadRequestException(`Warning already decided (${existing.decision})`);
    }

    // CP-2 enforcement (Elder Mode / trusted-contact).
    const decisionKind: DecisionKind =
      dto.decision === GiftCardGuardUserDecision.CONTINUED_ANYWAY ? 'CONTINUE' : 'OTHER';
    await this.enforcement.enforceDecision(user, {
      module: 'GIFTCARDGUARD',
      eventId: existing.id,
      riskLevel: existing.riskLevel,
      amountMinor: existing.denominationMinor,
      decisionKind,
    });

    const nextDecision = dto.decision as unknown as GiftCardGuardDecision;
    const updated = await this.prisma.giftCardWarning.update({
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
      entityType: 'GIFTCARD_WARNING',
      entityId: existing.id,
      eventType: `GIFTCARD_WARNING_${dto.decision}`,
      eventDescription:
        dto.decision === GiftCardGuardUserDecision.CONTINUED_ANYWAY
          ? 'User continued past gift-card warning'
          : `Gift-card warning resolved: ${dto.decision}`,
      metadata: { decision: dto.decision, notes: dto.notes ?? null },
    });

    if (dto.decision === GiftCardGuardUserDecision.ESCALATED_TO_TRUSTED_CONTACT) {
      const review = await this.trustedContactReview.requestReview({
        user,
        triggerModule: 'GIFTCARDGUARD',
        triggerEventId: existing.id,
        triggerSummary:
          existing.impersonationType && existing.impersonationType !== 'NONE'
            ? `Someone claiming ${existing.impersonationType.toLowerCase().replace('_', ' ')} is asking for a gift card`
            : `Gift card request flagged as ${existing.riskLevel} risk`,
        metadata: { giftCardWarningId: existing.id },
      });
      if (review) {
        await this.prisma.giftCardWarning.update({
          where: { id: existing.id },
          data: { trustedContactReviewId: review.id },
        });
      } else {
        this.logger.warn(
          `Gift-card warning ${existing.id}: no eligible trusted contact — escalation acknowledged but unrouted`,
        );
      }
    }

    return updated;
  }

  history(user: AuthenticatedUser, limit = 50): Promise<GiftCardWarning[]> {
    return this.prisma.giftCardWarning.findMany({
      where: { userId: user.userId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 200),
    });
  }
}
