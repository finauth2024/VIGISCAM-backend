import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { GuardianPauseRiskLevel, GuardianPauseStatus, PauseEvent, RiskLevel } from '@prisma/client';
import { AuthenticatedUser } from '../../common/auth/auth.types';
import { EventsService } from '../../common/events/events.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EvidenceService } from '../evidence-vault/evidence.service';
import {
  DecisionKind,
  ProtectionEnforcementService,
} from '../protection-settings/protection-enforcement.service';
import { CompletePauseDto, PauseResolution } from './dto/complete-pause.dto';
import { StartPauseDto } from './dto/start-pause.dto';

const DEFAULT_PAUSE_DURATION_SECONDS = 30;

/**
 * Guardian Pause™ (Phase 9A).
 *
 * **Substrate.** Other Phase 9 modules (ScamHold 9B, GiftCardGuard 9C,
 * WalletGuard 9D, ClaimVerify 9E) call `start()` to put the user in a
 * countdown before a risky action proceeds. The frontend opens a
 * WebSocket on the user's room to render the countdown live.
 *
 * **Business rules** (per brief §1037 + §1053):
 *  - Elder Mode / trusted-contact policy is enforced in `complete()` via the
 *    shared `ProtectionEnforcementService` (CP-2): a `CONTINUED_ANYWAY`
 *    resolution is refused (ForbiddenException + Evidence Vault + AuditLog)
 *    when the user's protection settings disallow it — identical to ScamHold /
 *    GiftCardGuard / WalletGuard / ClaimVerify.
 *  - CRITICAL risk records a trusted-contact-review intent on `start()`; the
 *    actual gate is the `complete()` enforcement above (the user cannot
 *    continue through the pause without an approved review when policy requires
 *    one).
 *  - Repeated "Continue Anyway" increments `continueAnywayCount` on the next
 *    pause — feeds the risk-up-on-repeat rule.
 *
 * **Audit.** Every state transition appends a hash-chained Evidence
 * Vault event so the chain-of-custody trail survives even if a row
 * is later soft-deleted.
 */
@Injectable()
export class GuardianPauseService {
  private readonly logger = new Logger(GuardianPauseService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly evidence: EvidenceService,
    private readonly events: EventsService,
    private readonly enforcement: ProtectionEnforcementService,
  ) {}

  async start(user: AuthenticatedUser, dto: StartPauseDto): Promise<PauseEvent> {
    const durationSeconds = dto.durationSeconds ?? DEFAULT_PAUSE_DURATION_SECONDS;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + durationSeconds * 1000);

    // Count prior CONTINUED_ANYWAY decisions for this user — feeds the
    // risk-up-on-repeat rule. Scoped to the last 7 days to avoid history
    // dragging down a user who was honest two years ago.
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const priorContinueCount = await this.prisma.pauseEvent.count({
      where: {
        userId: user.userId,
        status: 'CONTINUED_ANYWAY',
        startedAt: { gte: sevenDaysAgo },
      },
    });

    const created = await this.prisma.pauseEvent.create({
      data: {
        userId: user.userId,
        tenantId: user.tenantId,
        riskLevel: dto.riskLevel,
        triggerType: dto.triggerType,
        triggerSummary: dto.triggerSummary,
        startedAt: now,
        expiresAt,
        continueAnywayCount: priorContinueCount,
        metadata: dto.metadata as never,
      },
    });

    const evidence = await this.evidence.append({
      tenantId: user.tenantId,
      actorId: user.userId,
      actorType: 'USER',
      entityType: 'GUARDIAN_PAUSE',
      entityId: created.id,
      eventType: 'GUARDIAN_PAUSE_STARTED',
      eventDescription: `Pause started (trigger=${dto.triggerType}, risk=${dto.riskLevel})`,
      metadata: {
        riskLevel: dto.riskLevel,
        triggerType: dto.triggerType,
        durationSeconds,
        priorContinueCount,
      },
    });
    const linked = await this.prisma.pauseEvent.update({
      where: { id: created.id },
      data: { evidenceEventId: evidence.id },
    });

    // Real-time push so the UI can render the countdown.
    this.events.emitGuardianPauseCountdown(user.userId, {
      pauseEventId: linked.id,
      status: 'STARTED',
      remainingSeconds: durationSeconds,
    });

    if (dto.riskLevel === ('CRITICAL' as GuardianPauseRiskLevel)) {
      // A CRITICAL pause flags trusted-contact-review intent. The hard gate is
      // applied in complete(): the shared ProtectionEnforcementService refuses a
      // CONTINUED_ANYWAY resolution unless the user's policy allows it (and, when
      // a review is required, an approved trusted-contact decision exists).
      this.logger.log(
        `CRITICAL Guardian Pause ${linked.id} — trusted-contact review intent ` +
          'recorded; continue-anyway enforced at completion.',
      );
    }

    return linked;
  }

  async complete(
    user: AuthenticatedUser,
    pauseEventId: string,
    dto: CompletePauseDto,
  ): Promise<PauseEvent> {
    const existing = await this.prisma.pauseEvent.findFirst({
      where: { id: pauseEventId, userId: user.userId },
    });
    if (!existing) {
      throw new NotFoundException('Pause event not found');
    }
    if (existing.status !== ('ACTIVE' as GuardianPauseStatus)) {
      throw new BadRequestException(`Pause already in terminal state (${existing.status})`);
    }

    // CP-2 enforcement (Elder Mode / trusted-contact): a CONTINUED_ANYWAY
    // resolution is refused when the user's protection settings disallow it.
    // Throws ForbiddenException + writes the blocked override to Evidence Vault
    // + AuditLog — identical to the ScamHold/GiftCardGuard/WalletGuard/
    // ClaimVerify release flow.
    if (dto.resolution === PauseResolution.CONTINUED_ANYWAY) {
      const decisionKind: DecisionKind = 'CONTINUE';
      await this.enforcement.enforceDecision(user, {
        module: 'GUARDIAN_PAUSE',
        eventId: existing.id,
        riskLevel: existing.riskLevel as unknown as RiskLevel,
        amountMinor: null,
        decisionKind,
      });
    }

    const nextStatus: GuardianPauseStatus =
      dto.resolution === PauseResolution.RESOLVED
        ? 'RESOLVED'
        : dto.resolution === PauseResolution.CONTINUED_ANYWAY
          ? 'CONTINUED_ANYWAY'
          : 'EXPIRED';

    const continuedCount =
      dto.resolution === PauseResolution.CONTINUED_ANYWAY
        ? existing.continueAnywayCount + 1
        : existing.continueAnywayCount;

    const updated = await this.prisma.pauseEvent.update({
      where: { id: existing.id },
      data: {
        status: nextStatus,
        resolvedAt: new Date(),
        resolutionNotes: dto.notes ?? null,
        continueAnywayCount: continuedCount,
      },
    });

    await this.evidence.append({
      tenantId: user.tenantId,
      actorId: user.userId,
      actorType: 'USER',
      entityType: 'GUARDIAN_PAUSE',
      entityId: existing.id,
      eventType: `GUARDIAN_PAUSE_${nextStatus}`,
      eventDescription:
        dto.resolution === PauseResolution.CONTINUED_ANYWAY
          ? `User continued through pause (count=${continuedCount})`
          : `Pause ${nextStatus.toLowerCase()}`,
      metadata: {
        resolution: dto.resolution,
        continueAnywayCount: continuedCount,
        notes: dto.notes ?? null,
      },
    });

    this.events.emitGuardianPauseCountdown(user.userId, {
      pauseEventId: existing.id,
      status: nextStatus === 'EXPIRED' ? 'EXPIRED' : 'RESOLVED',
      remainingSeconds: 0,
    });

    return updated;
  }

  history(user: AuthenticatedUser, limit = 50): Promise<PauseEvent[]> {
    return this.prisma.pauseEvent.findMany({
      where: { userId: user.userId },
      orderBy: { startedAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 200),
    });
  }
}
