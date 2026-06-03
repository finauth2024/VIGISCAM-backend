import { ProtectionSettings } from '@prisma/client';
import { ProtectionPolicyService } from './protection-policy.service';

function settings(over: Partial<ProtectionSettings> = {}): ProtectionSettings {
  return {
    id: 's1',
    userId: 'u1',
    scamHoldEnabled: true,
    guardianPauseEnabled: true,
    giftCardGuardEnabled: true,
    walletGuardEnabled: true,
    claimVerifyEnabled: true,
    scamMirrorEnabled: true,
    identityGraphEnabled: true,
    evidenceAutoSaveEnabled: true,
    trustedContactRequired: false,
    elderModeStrictLock: false,
    allowContinueAnyway: true,
    highRiskAmountThresholdMinor: 100000n,
    guardianPauseDurationSeconds: 30,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  } as ProtectionSettings;
}

describe('ProtectionPolicyService', () => {
  const policy = new ProtectionPolicyService();

  it('default settings: continue allowed, no review required', () => {
    const d = policy.evaluate(settings(), { riskLevel: 'CRITICAL' });
    expect(d.continueAnywayAllowed).toBe(true);
    expect(d.trustedContactReviewRequired).toBe(false);
  });

  it('elder strict lock blocks CONTINUE_ANYWAY + requires review on CRITICAL', () => {
    const d = policy.evaluate(settings({ elderModeStrictLock: true }), {
      riskLevel: 'CRITICAL',
    });
    expect(d.continueAnywayAllowed).toBe(false);
    expect(d.trustedContactReviewRequired).toBe(true);
    expect(d.reasons).toContain('ELDER_STRICT_LOCK_BLOCKS_CONTINUE');
  });

  it('account-level elderModeEnabled also blocks continue on CRITICAL', () => {
    const d = policy.evaluate(settings(), { riskLevel: 'CRITICAL', elderModeEnabled: true });
    expect(d.continueAnywayAllowed).toBe(false);
  });

  it('allowContinueAnyway=false blocks HIGH and CRITICAL', () => {
    const s = settings({ allowContinueAnyway: false });
    expect(policy.evaluate(s, { riskLevel: 'HIGH' }).continueAnywayAllowed).toBe(false);
    expect(policy.evaluate(s, { riskLevel: 'CRITICAL' }).continueAnywayAllowed).toBe(false);
    // ...but MEDIUM is still allowed.
    expect(policy.evaluate(s, { riskLevel: 'MEDIUM' }).continueAnywayAllowed).toBe(true);
  });

  it('trustedContactRequired forces review on CRITICAL and blocks continue', () => {
    const d = policy.evaluate(settings({ trustedContactRequired: true }), {
      riskLevel: 'CRITICAL',
    });
    expect(d.trustedContactReviewRequired).toBe(true);
    expect(d.continueAnywayAllowed).toBe(false);
  });

  it('elder strict lock + HIGH over the amount threshold requires review', () => {
    const d = policy.evaluate(settings({ elderModeStrictLock: true }), {
      riskLevel: 'HIGH',
      amountMinor: 250000,
    });
    expect(d.trustedContactReviewRequired).toBe(true);
  });

  it('LOW risk never blocks or requires review', () => {
    const d = policy.evaluate(
      settings({ elderModeStrictLock: true, allowContinueAnyway: false }),
      { riskLevel: 'LOW' },
    );
    expect(d.continueAnywayAllowed).toBe(true);
    expect(d.trustedContactReviewRequired).toBe(false);
  });
});
