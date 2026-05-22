import { Injectable, NotFoundException } from '@nestjs/common';
import { RiskEvent } from '@prisma/client';
import { AuthenticatedUser, RequestContext } from '../../common/auth/auth.types';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AlertsService } from '../alerts/alerts.service';
import { EvidenceService } from '../evidence-vault/evidence.service';
import { FreezeLockService } from '../freezelock/freezelock.service';
import { CreateRiskEventDto } from './dto/create-risk-event.dto';
import { levelForScore, recommendedActionForLevel, scoreSignals } from './risk.scoring';

export interface RiskEventResult {
  riskEvent: RiskEvent;
  interventionTriggered: boolean;
  freezeLockEventId?: string;
}

/**
 * The risk hub. Every scam signal becomes a scored RiskEvent; a serious one
 * automatically raises an alert and — at CRITICAL — fires FreezeLock. Every
 * risk event is written to the hash-chained Evidence Vault.
 */
@Injectable()
export class RiskService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly evidence: EvidenceService,
    private readonly alerts: AlertsService,
    private readonly freezeLock: FreezeLockService,
  ) {}

  async createRiskEvent(
    user: AuthenticatedUser,
    dto: CreateRiskEventDto,
    ctx: RequestContext = {},
  ): Promise<RiskEventResult> {
    const riskScore = scoreSignals(dto.signals);
    const riskLevel = levelForScore(riskScore);
    const recommendedAction = recommendedActionForLevel(riskLevel);

    let riskEvent = await this.prisma.riskEvent.create({
      data: {
        tenantId: user.tenantId,
        userId: user.userId,
        sessionId: dto.sessionId ?? null,
        moduleSource: dto.moduleSource ?? 'RISK_FUSION',
        eventType: dto.eventType,
        riskScore,
        riskLevel,
        triggerReason: dto.triggerReason,
        recommendedAction,
        detectedSignals: dto.signals,
      },
    });

    await this.evidence.append({
      tenantId: user.tenantId,
      actorId: user.userId,
      actorType: 'USER',
      entityType: 'RISK_EVENT',
      entityId: riskEvent.id,
      eventType: 'RISK_SCORE_UPDATED',
      eventDescription: `Risk event "${dto.eventType}" scored ${riskScore} (${riskLevel})`,
      metadata: { riskScore, riskLevel, signals: dto.signals },
      ipAddress: ctx.ip ?? null,
    });

    // HIGH and above: alert the user.
    if (riskLevel === 'HIGH' || riskLevel === 'CRITICAL') {
      await this.alerts.create({
        tenantId: user.tenantId,
        userId: user.userId,
        riskEventId: riskEvent.id,
        type: 'HIGH_RISK_DETECTED',
        severity: riskLevel === 'CRITICAL' ? 'CRITICAL' : 'HIGH',
        title: 'High-risk activity detected',
        message: `${dto.eventType}: ${dto.triggerReason}`,
      });
    }

    // CRITICAL: fire an emergency intervention.
    let freezeLockEventId: string | undefined;
    if (riskLevel === 'CRITICAL') {
      const freeze = await this.freezeLock.trigger(
        user,
        {
          riskEventId: riskEvent.id,
          sessionId: dto.sessionId ?? null,
          trigger: `Critical risk score (${riskScore}) — ${dto.eventType}`,
        },
        ctx,
      );
      freezeLockEventId = freeze.id;
      riskEvent = await this.prisma.riskEvent.update({
        where: { id: riskEvent.id },
        data: { status: 'INTERVENING' },
      });
    }

    return {
      riskEvent,
      interventionTriggered: freezeLockEventId !== undefined,
      freezeLockEventId,
    };
  }

  list(user: AuthenticatedUser): Promise<RiskEvent[]> {
    return this.prisma.riskEvent.findMany({
      where: { userId: user.userId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async getById(user: AuthenticatedUser, id: string): Promise<RiskEvent> {
    const riskEvent = await this.prisma.riskEvent.findUnique({ where: { id } });
    if (!riskEvent || riskEvent.userId !== user.userId) {
      throw new NotFoundException('Risk event not found');
    }
    return riskEvent;
  }
}
