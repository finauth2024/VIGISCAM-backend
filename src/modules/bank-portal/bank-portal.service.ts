import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/auth.types';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EvidenceService } from '../evidence-vault/evidence.service';
import { BankCaseReviewDecision, ReviewCaseDto } from './dto/review-case.dto';
import { BankQueueQueryDto, BankQueueRiskFilter } from './dto/queue-query.dto';
import { TellerAssistDto } from './dto/teller-assist.dto';
import { scoreTellerAssist, TellerAssistRiskLevel } from './teller-assist.scorer';

/**
 * BankGuard portal service (Phase 10B).
 *
 * Three responsibilities:
 *   1. `getQueue` — surface ScamHold + WalletGuard events scoped to
 *      this bank tenant. Read-only feed for the bank analyst dashboard.
 *   2. `tellerAssist` — score a teller-counter transaction in real time
 *      and append the scoring decision to the Evidence Vault chain.
 *   3. `reviewCase` — record the bank's professional opinion on an
 *      escalated ScamHold case. The customer's own decision is
 *      untouched; this is a parallel record that family/agencies can
 *      see when weighing the situation.
 */
@Injectable()
export class BankPortalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly evidence: EvidenceService,
  ) {}

  // ─── Live risk queue ───────────────────────────────────────────────────────

  async getQueue(user: AuthenticatedUser, query: BankQueueQueryDto) {
    const min = query.minRiskLevel ?? BankQueueRiskFilter.MEDIUM;
    const levels = BankPortalService.riskLevelsAtOrAbove(min);
    const limit = query.limit ?? 50;

    const [scamHolds, walletChecks] = await Promise.all([
      this.prisma.scamHoldEvent.findMany({
        where: {
          tenantId: user.tenantId,
          riskLevel: { in: levels as never },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: {
          id: true,
          userId: true,
          transactionType: true,
          amountMinor: true,
          currency: true,
          recipient: true,
          riskScore: true,
          riskLevel: true,
          status: true,
          createdAt: true,
        },
      }),
      this.prisma.walletCheck.findMany({
        where: {
          tenantId: user.tenantId,
          riskLevel: { in: levels as never },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: {
          id: true,
          userId: true,
          network: true,
          address: true,
          riskScore: true,
          riskLevel: true,
          decision: true,
          createdAt: true,
        },
      }),
    ]);

    return {
      generatedAt: new Date().toISOString(),
      filter: { minRiskLevel: min, limit },
      scamHoldEvents: scamHolds.map((s) => ({
        ...s,
        amountMinor: s.amountMinor.toString(),
      })),
      walletChecks,
    };
  }

  // ─── Teller-assist scoring ─────────────────────────────────────────────────

  async tellerAssist(user: AuthenticatedUser, dto: TellerAssistDto) {
    const scoring = scoreTellerAssist({
      transactionChannel: dto.transactionChannel,
      amountMinor: dto.amountMinor,
      recipientType: dto.recipientType,
      customerStatedReason: dto.customerStatedReason,
      behaviorSignals: dto.behaviorSignals,
      elderMode: dto.elderMode,
    });

    const row = await this.prisma.tellerAssistScore.create({
      data: {
        tenantId: user.tenantId,
        tellerUserId: user.userId,
        customerReference: dto.customerReference,
        transactionChannel: dto.transactionChannel,
        amountMinor: BigInt(dto.amountMinor),
        currency: dto.currency ?? 'USD',
        recipientType: dto.recipientType,
        customerStatedReason: dto.customerStatedReason,
        behaviorSignals: (dto.behaviorSignals ?? []) as never,
        riskScore: scoring.riskScore,
        riskLevel: scoring.riskLevel,
        recommendedAction: scoring.recommendedAction,
        riskBreakdown: scoring.breakdown as never,
      },
    });

    const evidenceEvent = await this.evidence.append({
      tenantId: user.tenantId,
      actorId: user.userId,
      actorType: 'USER',
      entityType: 'TELLER_ASSIST_SCORE',
      entityId: row.id,
      eventType: 'BANK_PORTAL_TELLER_SCORED',
      eventDescription: `Teller scored a ${scoring.riskLevel} transaction (${scoring.recommendedAction})`,
      metadata: {
        riskScore: scoring.riskScore,
        riskLevel: scoring.riskLevel,
        recommendedAction: scoring.recommendedAction,
        transactionChannel: dto.transactionChannel,
        recipientType: dto.recipientType,
      },
    });

    const updated = await this.prisma.tellerAssistScore.update({
      where: { id: row.id },
      data: { evidenceEventId: evidenceEvent.id },
    });

    return {
      ...updated,
      amountMinor: updated.amountMinor.toString(),
      scoring,
    };
  }

  // ─── Bank case review ──────────────────────────────────────────────────────

  async reviewCase(user: AuthenticatedUser, scamHoldEventId: string, dto: ReviewCaseDto) {
    const scamHold = await this.prisma.scamHoldEvent.findUnique({
      where: { id: scamHoldEventId },
      select: { id: true, tenantId: true, userId: true, riskLevel: true, status: true },
    });
    if (!scamHold) {
      throw new NotFoundException('ScamHold case not found');
    }
    // The bank reviewing a case may not be the same tenant the customer
    // belongs to — by design, a bank can review any case where the
    // protected user holds an account at this bank. The substrate for
    // that lookup is the user-account-binding (a Phase 10F/11A concern).
    // Until that's in, we restrict to same-tenant cases so we don't
    // accidentally leak across banks.
    if (scamHold.tenantId !== user.tenantId) {
      throw new NotFoundException('ScamHold case not found');
    }

    const existing = await this.prisma.bankCaseReview.findUnique({
      where: {
        tenantId_scamHoldEventId: {
          tenantId: user.tenantId,
          scamHoldEventId,
        },
      },
    });
    if (existing) {
      throw new BadRequestException('This case has already been reviewed by your bank');
    }

    const row = await this.prisma.bankCaseReview.create({
      data: {
        tenantId: user.tenantId,
        scamHoldEventId,
        reviewedByUserId: user.userId,
        decision: dto.decision,
        notes: dto.notes,
      },
    });

    const evidenceEvent = await this.evidence.append({
      tenantId: user.tenantId,
      actorId: user.userId,
      actorType: 'USER',
      entityType: 'BANK_CASE_REVIEW',
      entityId: row.id,
      eventType: `BANK_PORTAL_CASE_${dto.decision}`,
      eventDescription: `Bank analyst recorded a ${dto.decision} review on ScamHold ${scamHoldEventId}`,
      metadata: {
        scamHoldEventId,
        decision: dto.decision,
      },
    });

    return this.prisma.bankCaseReview.update({
      where: { id: row.id },
      data: { evidenceEventId: evidenceEvent.id },
    });
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private static riskLevelsAtOrAbove(min: BankQueueRiskFilter): TellerAssistRiskLevel[] {
    if (min === BankQueueRiskFilter.CRITICAL) return ['CRITICAL'];
    if (min === BankQueueRiskFilter.HIGH) return ['HIGH', 'CRITICAL'];
    return ['MEDIUM', 'HIGH', 'CRITICAL'];
  }
}

// Re-export for tests; nothing else in the codebase imports the enum value.
export { BankCaseReviewDecision };
