import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ScamHoldEvent, ScamHoldStatus } from '@prisma/client';
import { AuthenticatedUser } from '../../common/auth/auth.types';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EvidenceService } from '../evidence-vault/evidence.service';
import { GuardianPauseService } from '../guardian-pause/guardian-pause.service';
import {
  DecisionKind,
  ProtectionEnforcementService,
} from '../protection-settings/protection-enforcement.service';
import { TrustedContactReviewService } from '../trusted-contact-review/trusted-contact-review.service';
import { CheckScamHoldDto } from './dto/check-scamhold.dto';
import { DecideScamHoldDto, ScamHoldDecision } from './dto/decide-scamhold.dto';
import { scoreScamHold } from './scamhold.scoring';

/**
 * ScamHold AI™ (Phase 9B).
 *
 * A user-initiated risky financial action is run through `check()`; the
 * service scores it, opens a SCAMHOLD_EVENT, attaches a CRITICAL flow to
 * Guardian Pause (9A), and writes Evidence Vault. `decide()` records
 * the terminal outcome.
 *
 * Phase 9D WalletGuard will provide a richer `recipientRisk` on the
 * inbound DTO; for now callers either pre-compute it or default to
 * UNKNOWN. Phase 11B swaps the deterministic scorer for the real ML
 * model behind AI_SERVICE_URL.
 */
@Injectable()
export class ScamHoldService {
  private readonly logger = new Logger(ScamHoldService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly evidence: EvidenceService,
    private readonly guardianPause: GuardianPauseService,
    private readonly trustedContactReview: TrustedContactReviewService,
    private readonly enforcement: ProtectionEnforcementService,
  ) {}

  async check(user: AuthenticatedUser, dto: CheckScamHoldDto): Promise<ScamHoldEvent> {
    // Count prior CONTINUED_ANYWAY decisions in the last 30 days — feeds
    // the scorer's repeat-offender weight.
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const priorWarnings = await this.prisma.scamHoldEvent.count({
      where: {
        userId: user.userId,
        status: 'CONTINUE_ANYWAY',
        createdAt: { gte: thirtyDaysAgo },
      },
    });

    const scoring = scoreScamHold({
      transactionType: dto.transactionType,
      amountMinor: dto.amountMinor,
      currency: dto.currency,
      recipientRisk: dto.recipientRisk ?? 'UNKNOWN',
      urgencyDetected: dto.urgencyDetected,
      secrecyDetected: dto.secrecyDetected,
      activeCommunication: dto.activeCommunication,
      priorWarningsCount: priorWarnings,
    });

    const created = await this.prisma.scamHoldEvent.create({
      data: {
        userId: user.userId,
        tenantId: user.tenantId,
        transactionType: dto.transactionType,
        amountMinor: BigInt(dto.amountMinor),
        currency: dto.currency,
        recipient: dto.recipient,
        recipientRisk: dto.recipientRisk ?? 'UNKNOWN',
        urgencyDetected: dto.urgencyDetected ?? false,
        secrecyDetected: dto.secrecyDetected ?? false,
        activeCommunication: dto.activeCommunication ?? false,
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
      entityType: 'SCAMHOLD',
      entityId: created.id,
      eventType: 'SCAMHOLD_OPENED',
      eventDescription: `ScamHold opened: ${dto.transactionType} ${scoring.level} (score ${scoring.score})`,
      metadata: {
        riskScore: scoring.score,
        riskLevel: scoring.level,
        breakdown: scoring.breakdown,
        transactionType: dto.transactionType,
        // Don't store full recipient in metadata — recipient already lives
        // on the row; metadata is supplementary, never PII-redundant.
      },
    });

    // CRITICAL risk → pull Guardian Pause (Phase 9A). Note we use the
    // sub-9A service directly rather than asking the user to call /start
    // first — ScamHold is "the system held you", not "the user paused
    // themselves". The pause id is stored on the scamhold row.
    let guardianPauseId: string | null = null;
    if (scoring.level === 'CRITICAL') {
      const pause = await this.guardianPause.start(user, {
        riskLevel: 'CRITICAL',
        triggerType: 'SCAMHOLD_ACTIVE',
        triggerSummary: `${dto.transactionType.replace('_', ' ')} flagged as CRITICAL risk`,
        durationSeconds: 120,
        metadata: { scamholdEventId: created.id },
      });
      guardianPauseId = pause.id;
    }

    return this.prisma.scamHoldEvent.update({
      where: { id: created.id },
      data: {
        evidenceEventId: evidence.id,
        guardianPauseEventId: guardianPauseId,
      },
    });
  }

  async decide(
    user: AuthenticatedUser,
    scamHoldEventId: string,
    dto: DecideScamHoldDto,
  ): Promise<ScamHoldEvent> {
    const existing = await this.prisma.scamHoldEvent.findFirst({
      where: { id: scamHoldEventId, userId: user.userId },
    });
    if (!existing) {
      throw new NotFoundException('ScamHold event not found');
    }
    if (existing.status !== ('PENDING' as ScamHoldStatus)) {
      throw new BadRequestException(`ScamHold already decided (${existing.status})`);
    }

    // CP-2 enforcement (Elder Mode / trusted-contact): refuse CONTINUE_ANYWAY
    // when policy disallows it, and refuse RELEASE_AFTER_VERIFICATION until a
    // required trusted-contact approval exists. Throws ForbiddenException +
    // logs the blocked override to Evidence Vault + AuditLog.
    const decisionKind: DecisionKind =
      dto.decision === ScamHoldDecision.CONTINUE_ANYWAY
        ? 'CONTINUE'
        : dto.decision === ScamHoldDecision.RELEASE_AFTER_VERIFICATION
          ? 'RELEASE'
          : 'OTHER';
    await this.enforcement.enforceDecision(user, {
      module: 'SCAMHOLD',
      eventId: existing.id,
      riskLevel: existing.riskLevel,
      amountMinor: existing.amountMinor,
      decisionKind,
    });

    const nextStatus: ScamHoldStatus = dto.decision as unknown as ScamHoldStatus;

    const updated = await this.prisma.scamHoldEvent.update({
      where: { id: existing.id },
      data: {
        status: nextStatus,
        decidedAt: new Date(),
        decisionNotes: dto.notes ?? null,
      },
    });

    await this.evidence.append({
      tenantId: user.tenantId,
      actorId: user.userId,
      actorType: 'USER',
      entityType: 'SCAMHOLD',
      entityId: existing.id,
      eventType: `SCAMHOLD_${dto.decision}`,
      eventDescription:
        dto.decision === ScamHoldDecision.CONTINUE_ANYWAY
          ? 'User pushed past ScamHold warning'
          : `ScamHold decision: ${dto.decision}`,
      metadata: { decision: dto.decision, notes: dto.notes ?? null },
    });

    // SEND_TO_TRUSTED_CONTACT → open a 9H review and fan-out notifications.
    if (dto.decision === ScamHoldDecision.SEND_TO_TRUSTED_CONTACT) {
      const review = await this.trustedContactReview.requestReview({
        user,
        triggerModule: 'SCAMHOLD',
        triggerEventId: existing.id,
        triggerSummary:
          `${existing.transactionType.replace('_', ' ')} for ` +
          `${existing.recipient} flagged as ${existing.riskLevel} risk`,
        metadata: { scamHoldEventId: existing.id },
      });
      if (review) {
        await this.prisma.scamHoldEvent.update({
          where: { id: existing.id },
          data: { trustedContactReviewId: review.id },
        });
      } else {
        this.logger.warn(
          `ScamHold ${existing.id}: no eligible trusted contact — escalation acknowledged but unrouted`,
        );
      }
    }

    return updated;
  }

  history(user: AuthenticatedUser, limit = 50): Promise<ScamHoldEvent[]> {
    return this.prisma.scamHoldEvent.findMany({
      where: { userId: user.userId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 200),
    });
  }
}
