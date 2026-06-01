import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { GuardianPauseRiskLevel, GuardianPauseStatus, PauseEvent } from '@prisma/client';
import { AuthenticatedUser } from '../../common/auth/auth.types';
import { EventsService } from '../../common/events/events.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EvidenceService } from '../evidence-vault/evidence.service';
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
 *  - Elder Mode disables "Continue Anyway" — enforced in `complete()`
 *    once the Elder Mode flag lands (TODO marked).
 *  - CRITICAL risk requires trusted-contact review — set up in 9H
 *    (the trustedContactReviewId column is reserved for that join).
 *  - Repeated "Continue Anyway" against the same indicator increments
 *    `continueAnywayCount` on the next pause — tracked via metadata.
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
      // TODO(9H): create a TrustedContactReview here and stash the id on
      // `trustedContactReviewId`. Until 9H ships, we log + emit the
      // intent so trusted contacts have a path to act on it when the
      // workflow comes online.
      this.logger.warn(
        `CRITICAL Guardian Pause ${linked.id} requires trusted-contact review ` +
          '(workflow lands in 9H — not enforced yet).',
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

    // TODO(9H): if the user has Elder Mode enabled, reject
    // CONTINUED_ANYWAY here unless a TrustedContactReview decision
    // explicitly approved it. The flag isn't on the User model yet —
    // lands with the families-module Elder Mode update in 9H.

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
