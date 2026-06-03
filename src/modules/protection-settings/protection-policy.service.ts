import { Injectable } from '@nestjs/common';
import { ProtectionSettings, RiskLevel } from '@prisma/client';

/**
 * The outcome of evaluating a user's protection policy against a single
 * risky action. Consumed by Guardian Pause / ScamHold / GiftCardGuard /
 * WalletGuard / ClaimVerify to enforce Elder Mode + trusted-contact rules
 * (brief §8/§9, reviewer #2/#3).
 */
export interface ProtectionPolicyDecision {
  /** Whether the user may push past the held action (CONTINUE_ANYWAY). */
  continueAnywayAllowed: boolean;
  /** Whether an APPROVED trusted-contact review is required before release. */
  trustedContactReviewRequired: boolean;
  /** Guardian Pause countdown to apply, from the user's settings. */
  guardianPauseDurationSeconds: number;
  /** Machine-readable reason codes for the evidence/audit trail. */
  reasons: string[];
}

export interface PolicyInput {
  riskLevel: RiskLevel;
  /** Optional transaction amount (smallest unit) to test the threshold. */
  amountMinor?: bigint | number | null;
  /** User.elderModeEnabled — the account-level elder flag. */
  elderModeEnabled?: boolean;
}

const HIGH_OR_CRITICAL: RiskLevel[] = ['HIGH', 'CRITICAL'];

/**
 * Pure, deterministic protection-policy engine. No I/O — given a user's
 * ProtectionSettings + the action's risk, it decides what enforcement applies.
 * Keeping it pure makes the rules unit-testable and identical across modules.
 */
@Injectable()
export class ProtectionPolicyService {
  evaluate(settings: ProtectionSettings, input: PolicyInput): ProtectionPolicyDecision {
    const reasons: string[] = [];
    const critical = input.riskLevel === 'CRITICAL';
    const highOrCritical = HIGH_OR_CRITICAL.includes(input.riskLevel);

    const overThreshold =
      input.amountMinor != null &&
      BigInt(input.amountMinor) >= settings.highRiskAmountThresholdMinor;

    const elderStrict = settings.elderModeStrictLock || !!input.elderModeEnabled;

    // ── Trusted-contact review requirement ────────────────────────────────
    let trustedContactReviewRequired = false;
    if (settings.trustedContactRequired && critical) {
      trustedContactReviewRequired = true;
      reasons.push('POLICY_TRUSTED_CONTACT_REQUIRED_ON_CRITICAL');
    }
    if (settings.elderModeStrictLock && (critical || (highOrCritical && overThreshold))) {
      trustedContactReviewRequired = true;
      reasons.push('ELDER_STRICT_LOCK_REQUIRES_REVIEW');
    }

    // ── Continue-anyway permission ────────────────────────────────────────
    let continueAnywayAllowed = true;
    if (!settings.allowContinueAnyway && highOrCritical) {
      continueAnywayAllowed = false;
      reasons.push('CONTINUE_ANYWAY_DISABLED_BY_SETTINGS');
    }
    if (elderStrict && critical) {
      continueAnywayAllowed = false;
      reasons.push('ELDER_STRICT_LOCK_BLOCKS_CONTINUE');
    }
    // A required, not-yet-approved review always blocks a unilateral continue.
    if (trustedContactReviewRequired) {
      continueAnywayAllowed = false;
    }

    return {
      continueAnywayAllowed,
      trustedContactReviewRequired,
      guardianPauseDurationSeconds: settings.guardianPauseDurationSeconds,
      reasons,
    };
  }
}
