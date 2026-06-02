import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ClaimVerifyRiskLevel } from '@prisma/client';
import { AuthenticatedUser } from '../../common/auth/auth.types';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EvidenceService } from '../evidence-vault/evidence.service';
import { GroomingCheckDto } from './dto/grooming-check.dto';
import {
  ModerationDecisionDto,
  PlatformModerationDecision as PlatformDecisionEnum,
} from './dto/moderation-decision.dto';
import { ModerationQueueQueryDto, PlatformQueueRiskFilter } from './dto/moderation-queue-query.dto';
import { scoreGroomingCheck } from './grooming.scorer';

@Injectable()
export class PlatformPortalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly evidence: EvidenceService,
  ) {}

  // ─── Moderation queue ──────────────────────────────────────────────────────

  async getModerationQueue(user: AuthenticatedUser, query: ModerationQueueQueryDto) {
    const min = query.minRiskLevel ?? PlatformQueueRiskFilter.MEDIUM;
    const levels = PlatformPortalService.riskLevelsAtOrAbove(min);
    const limit = query.limit ?? 50;

    const [claims, groomingChecks] = await Promise.all([
      this.prisma.claimVerification.findMany({
        where: {
          tenantId: user.tenantId,
          riskLevel: { in: levels },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: {
          id: true,
          userId: true,
          claimType: true,
          riskScore: true,
          riskLevel: true,
          decision: true,
          createdAt: true,
        },
      }),
      this.prisma.groomingCheckScore.findMany({
        where: {
          tenantId: user.tenantId,
          riskLevel: { in: levels as never },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: {
          id: true,
          moderatorUserId: true,
          subjectReference: true,
          ageGapSignal: true,
          minorSuspected: true,
          riskScore: true,
          riskLevel: true,
          recommendedAction: true,
          createdAt: true,
        },
      }),
    ]);

    return {
      generatedAt: new Date().toISOString(),
      filter: { minRiskLevel: min, limit },
      claimVerifications: claims,
      groomingChecks,
    };
  }

  // ─── Grooming scoring ──────────────────────────────────────────────────────

  async groomingCheck(user: AuthenticatedUser, dto: GroomingCheckDto) {
    const scoring = scoreGroomingCheck({
      ageGapSignal: dto.ageGapSignal,
      relationshipDurationDays: dto.relationshipDurationDays,
      loveBombingDetected: dto.loveBombingDetected,
      isolationLanguageDetected: dto.isolationLanguageDetected,
      paymentRequestDetected: dto.paymentRequestDetected,
      photoSolicitationDetected: dto.photoSolicitationDetected,
      moveToPrivateChannelDetected: dto.moveToPrivateChannelDetected,
      piiEscalationDetected: dto.piiEscalationDetected,
      minorSuspected: dto.minorSuspected,
    });

    const row = await this.prisma.groomingCheckScore.create({
      data: {
        tenantId: user.tenantId,
        moderatorUserId: user.userId,
        subjectReference: dto.subjectReference,
        ageGapSignal: dto.ageGapSignal,
        relationshipDurationDays: dto.relationshipDurationDays,
        loveBombingDetected: dto.loveBombingDetected ?? false,
        isolationLanguageDetected: dto.isolationLanguageDetected ?? false,
        paymentRequestDetected: dto.paymentRequestDetected ?? false,
        photoSolicitationDetected: dto.photoSolicitationDetected ?? false,
        moveToPrivateChannelDetected: dto.moveToPrivateChannelDetected ?? false,
        piiEscalationDetected: dto.piiEscalationDetected ?? false,
        minorSuspected: dto.minorSuspected ?? false,
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
      entityType: 'GROOMING_CHECK',
      entityId: row.id,
      eventType: 'PLATFORM_PORTAL_GROOMING_SCORED',
      eventDescription: `Grooming check scored ${scoring.riskLevel} (${scoring.recommendedAction})`,
      metadata: {
        riskScore: scoring.riskScore,
        riskLevel: scoring.riskLevel,
        recommendedAction: scoring.recommendedAction,
        minorSuspected: dto.minorSuspected ?? false,
        ageGapSignal: dto.ageGapSignal,
      },
    });

    const updated = await this.prisma.groomingCheckScore.update({
      where: { id: row.id },
      data: { evidenceEventId: evidenceEvent.id },
    });

    return { ...updated, scoring };
  }

  // ─── Moderation decision on a flagged claim ────────────────────────────────

  async decideOnClaim(
    user: AuthenticatedUser,
    claimVerificationId: string,
    dto: ModerationDecisionDto,
  ) {
    const claim = await this.prisma.claimVerification.findUnique({
      where: { id: claimVerificationId },
      select: { id: true, tenantId: true, userId: true, claimType: true, riskLevel: true },
    });
    if (!claim) {
      throw new NotFoundException('Claim verification not found');
    }
    // Same scoping rationale as the bank portal: until the
    // user-platform-binding table lands, restrict cross-tenant moderation.
    if (claim.tenantId !== user.tenantId) {
      throw new NotFoundException('Claim verification not found');
    }

    const existing = await this.prisma.platformModerationDecision.findUnique({
      where: {
        tenantId_claimVerificationId: {
          tenantId: user.tenantId,
          claimVerificationId,
        },
      },
    });
    if (existing) {
      throw new BadRequestException('This claim has already been moderated by your platform');
    }

    const row = await this.prisma.platformModerationDecision.create({
      data: {
        tenantId: user.tenantId,
        claimVerificationId,
        decidedByUserId: user.userId,
        decision: dto.decision,
        notes: dto.notes,
      },
    });

    const evidenceEvent = await this.evidence.append({
      tenantId: user.tenantId,
      actorId: user.userId,
      actorType: 'USER',
      entityType: 'PLATFORM_MODERATION',
      entityId: row.id,
      eventType: `PLATFORM_PORTAL_MOD_${dto.decision}`,
      eventDescription: `Moderator recorded ${dto.decision} on claim ${claimVerificationId}`,
      metadata: {
        claimVerificationId,
        decision: dto.decision,
      },
    });

    return this.prisma.platformModerationDecision.update({
      where: { id: row.id },
      data: { evidenceEventId: evidenceEvent.id },
    });
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private static riskLevelsAtOrAbove(min: PlatformQueueRiskFilter): ClaimVerifyRiskLevel[] {
    if (min === PlatformQueueRiskFilter.CRITICAL) return [ClaimVerifyRiskLevel.CRITICAL];
    if (min === PlatformQueueRiskFilter.HIGH) {
      return [ClaimVerifyRiskLevel.HIGH, ClaimVerifyRiskLevel.CRITICAL];
    }
    return [ClaimVerifyRiskLevel.MEDIUM, ClaimVerifyRiskLevel.HIGH, ClaimVerifyRiskLevel.CRITICAL];
  }
}

export { PlatformDecisionEnum };
