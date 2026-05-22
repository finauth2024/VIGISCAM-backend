import { Injectable } from '@nestjs/common';
import { FreezeLockEvent } from '@prisma/client';
import { AuthenticatedUser, RequestContext } from '../../common/auth/auth.types';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AlertsService } from '../alerts/alerts.service';
import { EvidenceService } from '../evidence-vault/evidence.service';

/** The intervention actions applied when no explicit set is supplied. */
export const DEFAULT_FREEZELOCK_ACTIONS = [
  'DISPLAY_INTERVENTION_WARNING',
  'PAUSE_RISKY_ACTION',
  'NOTIFY_TRUSTED_CONTACT',
  'START_EVIDENCE_CAPTURE',
];

export interface FreezeLockTrigger {
  trigger: string;
  riskEventId?: string | null;
  sessionId?: string | null;
  actions?: string[];
}

/**
 * FreezeLock — the emergency-intervention engine (PDF §21). Executes an
 * intervention, flags the affected session, writes a hash-chained evidence
 * record, and raises a critical alert.
 */
@Injectable()
export class FreezeLockService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly evidence: EvidenceService,
    private readonly alerts: AlertsService,
  ) {}

  async trigger(
    user: AuthenticatedUser,
    input: FreezeLockTrigger,
    ctx: RequestContext = {},
  ): Promise<FreezeLockEvent> {
    const actions = input.actions?.length ? input.actions : DEFAULT_FREEZELOCK_ACTIONS;

    const event = await this.prisma.freezeLockEvent.create({
      data: {
        tenantId: user.tenantId,
        userId: user.userId,
        riskEventId: input.riskEventId ?? null,
        sessionId: input.sessionId ?? null,
        trigger: input.trigger,
        actions,
      },
    });

    // Flag the affected session, if one was supplied and is the caller's.
    if (input.sessionId) {
      await this.prisma.session.updateMany({
        where: { id: input.sessionId, userId: user.userId },
        data: { status: 'FLAGGED' },
      });
    }

    await this.evidence.append({
      tenantId: user.tenantId,
      actorId: user.userId,
      actorType: 'USER',
      entityType: 'FREEZELOCK',
      entityId: event.id,
      eventType: 'FREEZELOCK_EXECUTED',
      eventDescription: `FreezeLock executed: ${input.trigger}`,
      metadata: { actions },
      ipAddress: ctx.ip ?? null,
    });

    await this.alerts.create({
      tenantId: user.tenantId,
      userId: user.userId,
      riskEventId: input.riskEventId ?? undefined,
      type: 'HUMAN_PAUSE_REQUIRED',
      severity: 'CRITICAL',
      title: 'Emergency intervention triggered',
      message: input.trigger,
    });

    return event;
  }

  list(user: AuthenticatedUser): Promise<FreezeLockEvent[]> {
    return this.prisma.freezeLockEvent.findMany({
      where: { userId: user.userId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }
}
