import { Injectable } from '@nestjs/common';
import { RiskEvent, RiskLevel, RiskModuleSource } from '@prisma/client';
import { AuthenticatedUser } from '../../common/auth/auth.types';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface RecordRiskEventInput {
  moduleSource: RiskModuleSource;
  eventType: string;
  riskScore: number;
  riskLevel: RiskLevel;
  triggerReason: string;
  recommendedAction: string;
  detectedSignals?: string[];
  sessionId?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * CP-3 — the unified RiskEvent feed. Every protection module (Guardian Pause,
 * ScamHold, GiftCardGuard, WalletGuard, ClaimVerify) records a RiskEvent on
 * each check/scan so "every scam signal becomes a risk event" (brief §23/§27,
 * reviewer #3). The module's own event id is carried in metadata so the master
 * RiskEvent links back without a per-table FK.
 */
@Injectable()
export class RiskEventRecorderService {
  constructor(private readonly prisma: PrismaService) {}

  record(user: AuthenticatedUser, input: RecordRiskEventInput): Promise<RiskEvent> {
    return this.prisma.riskEvent.create({
      data: {
        tenantId: user.tenantId,
        userId: user.userId,
        sessionId: input.sessionId ?? null,
        moduleSource: input.moduleSource,
        eventType: input.eventType,
        riskScore: input.riskScore,
        riskLevel: input.riskLevel,
        triggerReason: input.triggerReason,
        recommendedAction: input.recommendedAction,
        detectedSignals: input.detectedSignals ?? [],
        metadata: input.metadata as never,
      },
    });
  }
}
