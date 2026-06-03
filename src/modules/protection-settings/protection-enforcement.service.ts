import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { RiskLevel, TrustedContactReviewTriggerModule } from '@prisma/client';
import { AuthenticatedUser } from '../../common/auth/auth.types';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EvidenceService } from '../evidence-vault/evidence.service';
import { TrustedContactReviewService } from '../trusted-contact-review/trusted-contact-review.service';
import { ProtectionPolicyDecision, ProtectionPolicyService } from './protection-policy.service';
import { ProtectionSettingsService } from './protection-settings.service';

export type DecisionKind = 'CONTINUE' | 'RELEASE' | 'OTHER';

export interface EnforceParams {
  module: TrustedContactReviewTriggerModule;
  eventId: string;
  riskLevel: RiskLevel;
  amountMinor?: bigint | number | null;
  decisionKind: DecisionKind;
}

/**
 * CP-2 — the cross-module enforcement gate. Wraps the pure policy engine with
 * the trusted-contact-review lookup + Evidence Vault / AuditLog side effects so
 * every protection module enforces Elder Mode + trusted-contact rules
 * identically (reviewer #2/#3/#5, brief §8/§9):
 *   - CONTINUE_ANYWAY is refused when policy disallows it.
 *   - a held action whose policy requires review cannot be RELEASED until an
 *     APPROVE_AFTER_VERIFICATION review exists.
 *   - every blocked override is written to AuditLog + Evidence Vault.
 */
@Injectable()
export class ProtectionEnforcementService {
  private readonly logger = new Logger(ProtectionEnforcementService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: ProtectionSettingsService,
    private readonly policy: ProtectionPolicyService,
    private readonly reviews: TrustedContactReviewService,
    private readonly evidence: EvidenceService,
  ) {}

  /** Evaluate the user's policy for a held action (info only, no enforcement). */
  async evaluate(
    user: AuthenticatedUser,
    input: { riskLevel: RiskLevel; amountMinor?: bigint | number | null },
  ): Promise<ProtectionPolicyDecision> {
    const settings = await this.settings.getSettings(user);
    const u = await this.prisma.user.findUnique({
      where: { id: user.userId },
      select: { elderModeEnabled: true },
    });
    return this.policy.evaluate(settings, {
      riskLevel: input.riskLevel,
      amountMinor: input.amountMinor,
      elderModeEnabled: u?.elderModeEnabled ?? false,
    });
  }

  /** Enforce policy on a decision; throws ForbiddenException when blocked. */
  async enforceDecision(
    user: AuthenticatedUser,
    p: EnforceParams,
  ): Promise<ProtectionPolicyDecision> {
    const decision = await this.evaluate(user, {
      riskLevel: p.riskLevel,
      amountMinor: p.amountMinor,
    });

    if (p.decisionKind === 'CONTINUE' && !decision.continueAnywayAllowed) {
      await this.logOverrideBlocked(user, p, decision, 'CONTINUE_ANYWAY_BLOCKED');
      throw new ForbiddenException({
        message:
          'This action cannot be continued under your protection settings. A trusted contact must approve it first.',
        reasons: decision.reasons,
        trustedContactReviewRequired: decision.trustedContactReviewRequired,
      });
    }

    if (p.decisionKind === 'RELEASE' && decision.trustedContactReviewRequired) {
      const approved = await this.reviews.hasApprovedReview(p.module, p.eventId);
      if (!approved) {
        await this.logOverrideBlocked(user, p, decision, 'RELEASE_BLOCKED_NO_APPROVAL');
        throw new ForbiddenException({
          message:
            'A trusted contact must approve this action before it can be released.',
          reasons: [...decision.reasons, 'AWAITING_TRUSTED_CONTACT_APPROVAL'],
          trustedContactReviewRequired: true,
        });
      }
    }

    return decision;
  }

  private async logOverrideBlocked(
    user: AuthenticatedUser,
    p: EnforceParams,
    decision: ProtectionPolicyDecision,
    code: string,
  ): Promise<void> {
    await this.prisma.auditLog
      .create({
        data: {
          actorId: user.userId,
          actorType: 'USER',
          action: `PROTECTION_${code}`,
          targetType: p.module,
          targetId: p.eventId,
          metadata: {
            riskLevel: p.riskLevel,
            reasons: decision.reasons,
            decisionKind: p.decisionKind,
          },
        },
      })
      .catch((err: unknown) => this.logger.warn(`auditLog write failed: ${String(err)}`));

    await this.evidence
      .append({
        tenantId: user.tenantId,
        actorId: user.userId,
        actorType: 'USER',
        entityType: p.module,
        entityId: p.eventId,
        eventType: `PROTECTION_${code}`,
        eventDescription:
          `Blocked ${p.decisionKind} on ${p.riskLevel} ${p.module} action ` +
          `(${decision.reasons.join(', ') || 'policy'})`,
        metadata: { reasons: decision.reasons, riskLevel: p.riskLevel },
      })
      .catch((err: unknown) => this.logger.warn(`evidence write failed: ${String(err)}`));
  }
}
