import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { WalletCheck, WalletGuardDecision } from '@prisma/client';
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
import { isAddressValid } from './address-validators';
import { CheckWalletDto } from './dto/check-wallet.dto';
import { DecideWalletDto, WalletGuardUserDecision } from './dto/decide-wallet.dto';
import { scoreWalletGuard } from './walletguard.scoring';

/**
 * WalletGuard AI™ (Phase 9D). Validates + scores a crypto wallet
 * attempt before money moves. Format-invalid addresses skip scoring
 * and go straight to BLOCKED — no point ranking a typo. Format-valid
 * addresses get scored against reputation, clipboard-swap detection,
 * wallet-switch detection, Identity Graph match (9G), and verbal
 * pressure context.
 *
 * HIGH/CRITICAL pulls Guardian Pause (9A) with a WALLET_SWITCH trigger.
 */
@Injectable()
export class WalletGuardService {
  private readonly logger = new Logger(WalletGuardService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly evidence: EvidenceService,
    private readonly guardianPause: GuardianPauseService,
    private readonly trustedContactReview: TrustedContactReviewService,
    private readonly enforcement: ProtectionEnforcementService,
    private readonly riskEvents: RiskEventRecorderService,
  ) {}

  async check(user: AuthenticatedUser, dto: CheckWalletDto): Promise<WalletCheck> {
    const addressValid = isAddressValid(dto.network, dto.address);

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const priorWarnings = await this.prisma.walletCheck.count({
      where: {
        userId: user.userId,
        decision: 'CONTINUED_ANYWAY',
        createdAt: { gte: thirtyDaysAgo },
      },
    });

    // Format-invalid → score is effectively maximum; the caller's UI
    // should refuse before money moves.
    const scoring = addressValid
      ? scoreWalletGuard({
          reputation: dto.reputation ?? 'UNKNOWN',
          clipboardSwapDetected: dto.clipboardSwapDetected,
          walletSwitched: dto.walletSwitched,
          graphMatchScore: dto.graphMatchScore,
          urgencyDetected: dto.urgencyDetected,
          secrecyDetected: dto.secrecyDetected,
          priorWarningsCount: priorWarnings,
        })
      : {
          score: 100,
          level: 'CRITICAL' as const,
          breakdown: { addressInvalid: 100 },
        };

    const created = await this.prisma.walletCheck.create({
      data: {
        userId: user.userId,
        tenantId: user.tenantId,
        network: dto.network,
        address: dto.address.trim(),
        addressValid,
        reputation: dto.reputation ?? 'UNKNOWN',
        clipboardSwapDetected: dto.clipboardSwapDetected ?? false,
        walletSwitched: dto.walletSwitched ?? false,
        graphMatchScore: typeof dto.graphMatchScore === 'number' ? dto.graphMatchScore : null,
        urgencyDetected: dto.urgencyDetected ?? false,
        secrecyDetected: dto.secrecyDetected ?? false,
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
      entityType: 'WALLET_CHECK',
      entityId: created.id,
      eventType: 'WALLET_CHECK_OPENED',
      eventDescription: `WalletGuard ${dto.network}: ${scoring.level} (score ${scoring.score}, addressValid=${addressValid})`,
      metadata: {
        riskScore: scoring.score,
        riskLevel: scoring.level,
        breakdown: scoring.breakdown,
        network: dto.network,
        addressValid,
        // The address itself lives on the row; mirroring it in metadata
        // would leak PII into the chain-of-custody audit summary.
      },
    });

    let guardianPauseId: string | null = null;
    if (scoring.level === 'HIGH' || scoring.level === 'CRITICAL') {
      const pause = await this.guardianPause.start(user, {
        riskLevel: scoring.level,
        triggerType: dto.walletSwitched ? 'WALLET_SWITCH' : 'CRYPTO_TRANSFER_RISK',
        triggerSummary: !addressValid
          ? `Wallet address fails ${dto.network} format check`
          : dto.clipboardSwapDetected
            ? 'Clipboard wallet was swapped between copy and paste'
            : `${dto.network} wallet flagged as ${scoring.level} risk`,
        durationSeconds: 90,
        metadata: { walletCheckId: created.id },
      });
      guardianPauseId = pause.id;
    }

    // CP-3 — every module emits a unified RiskEvent.
    await this.riskEvents.record(user, {
      moduleSource: 'WALLETGUARD',
      eventType: 'WALLETGUARD_CHECK',
      riskScore: scoring.score,
      riskLevel: scoring.level,
      triggerReason: `Wallet transfer flagged as ${scoring.level} risk`,
      recommendedAction:
        scoring.level === 'CRITICAL'
          ? 'DO_NOT_PROCEED'
          : scoring.level === 'HIGH'
            ? 'VERIFY_BEFORE_PROCEEDING'
            : 'PROCEED_WITH_CAUTION',
      metadata: { walletCheckId: created.id, evidenceEventId: evidence.id },
    });

    return this.prisma.walletCheck.update({
      where: { id: created.id },
      data: {
        evidenceEventId: evidence.id,
        guardianPauseEventId: guardianPauseId,
      },
    });
  }

  async decide(
    user: AuthenticatedUser,
    walletCheckId: string,
    dto: DecideWalletDto,
  ): Promise<WalletCheck> {
    const existing = await this.prisma.walletCheck.findFirst({
      where: { id: walletCheckId, userId: user.userId },
    });
    if (!existing) {
      throw new NotFoundException('Wallet check not found');
    }
    if (existing.decision !== ('PENDING' as WalletGuardDecision)) {
      throw new BadRequestException(`Wallet check already decided (${existing.decision})`);
    }


    // CP-2 enforcement (Elder Mode / trusted-contact).
    const decisionKind: DecisionKind =
      dto.decision === WalletGuardUserDecision.CONTINUED_ANYWAY
        ? 'CONTINUE'
        : dto.decision === WalletGuardUserDecision.VALIDATED
          ? 'RELEASE'
          : 'OTHER';
    await this.enforcement.enforceDecision(user, {
      module: 'WALLETGUARD',
      eventId: existing.id,
      riskLevel: existing.riskLevel,
      amountMinor: undefined,
      decisionKind,
    });

    const nextDecision = dto.decision as unknown as WalletGuardDecision;
    const updated = await this.prisma.walletCheck.update({
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
      entityType: 'WALLET_CHECK',
      entityId: existing.id,
      eventType: `WALLET_CHECK_${dto.decision}`,
      eventDescription:
        dto.decision === WalletGuardUserDecision.CONTINUED_ANYWAY
          ? 'User continued past WalletGuard warning'
          : `Wallet check resolved: ${dto.decision}`,
      metadata: { decision: dto.decision, notes: dto.notes ?? null },
    });

    if (dto.decision === WalletGuardUserDecision.ESCALATED_TO_TRUSTED_CONTACT) {
      const review = await this.trustedContactReview.requestReview({
        user,
        triggerModule: 'WALLETGUARD',
        triggerEventId: existing.id,
        triggerSummary: `${existing.network} wallet flagged as ${existing.riskLevel} risk`,
        metadata: { walletCheckId: existing.id },
      });
      if (review) {
        await this.prisma.walletCheck.update({
          where: { id: existing.id },
          data: { trustedContactReviewId: review.id },
        });
      } else {
        this.logger.warn(
          `Wallet check ${existing.id}: no eligible trusted contact — escalation acknowledged but unrouted`,
        );
      }
    }

    return updated;
  }

  history(user: AuthenticatedUser, limit = 50): Promise<WalletCheck[]> {
    return this.prisma.walletCheck.findMany({
      where: { userId: user.userId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 200),
    });
  }
}
