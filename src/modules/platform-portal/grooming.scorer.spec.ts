import { scoreGroomingCheck } from './grooming.scorer';

describe('scoreGroomingCheck', () => {
  it('verified-adult, no flags scores 0 and recommends NONE', () => {
    const s = scoreGroomingCheck({
      ageGapSignal: 'AGES_BOTH_VERIFIED_ADULT',
    });
    expect(s.riskScore).toBe(0);
    expect(s.recommendedAction).toBe('NONE');
    expect(s.riskLevel).toBe('LOW');
  });

  it('a single love-bomb flag is MEDIUM and SOFT_INTERVENE', () => {
    const s = scoreGroomingCheck({
      ageGapSignal: 'AGES_BOTH_VERIFIED_ADULT',
      loveBombingDetected: true,
      relationshipDurationDays: 2, // 15 + 15 = 30
    });
    expect(s.riskScore).toBe(30);
    expect(s.riskLevel).toBe('MEDIUM');
    expect(s.recommendedAction).toBe('SOFT_INTERVENE');
  });

  it('adult-to-suspected-minor is a CRITICAL hard-stop to T&S regardless of other signals', () => {
    const s = scoreGroomingCheck({
      ageGapSignal: 'ADULT_TO_SUSPECTED_MINOR',
    });
    expect(s.riskLevel).toBe('CRITICAL');
    expect(s.recommendedAction).toBe('ESCALATE_TO_TRUST_AND_SAFETY');
  });

  it('minorSuspected + payment-request goes straight to law enforcement', () => {
    const s = scoreGroomingCheck({
      ageGapSignal: 'UNKNOWN',
      minorSuspected: true,
      paymentRequestDetected: true,
    });
    expect(s.recommendedAction).toBe('ESCALATE_TO_LAW_ENFORCEMENT');
    expect(s.riskLevel).toBe('CRITICAL');
  });

  it('minorSuspected + photo-solicitation also escalates to law enforcement', () => {
    const s = scoreGroomingCheck({
      ageGapSignal: 'UNKNOWN',
      minorSuspected: true,
      photoSolicitationDetected: true,
    });
    expect(s.recommendedAction).toBe('ESCALATE_TO_LAW_ENFORCEMENT');
  });

  it('minorSuspected alone (no escalation flags) is still HIGH+ but not law-enforcement', () => {
    const s = scoreGroomingCheck({
      ageGapSignal: 'UNKNOWN',
      minorSuspected: true,
    });
    // 5 (UNKNOWN) + 35 (minor) = 40 -> MEDIUM, not the law-enforcement hard-stop
    expect(s.recommendedAction).not.toBe('ESCALATE_TO_LAW_ENFORCEMENT');
    expect(s.riskLevel).toBe('MEDIUM');
  });

  it('caps the score at 100 even with every signal on', () => {
    const s = scoreGroomingCheck({
      ageGapSignal: 'AGE_GAP_LARGE',
      relationshipDurationDays: 1,
      loveBombingDetected: true,
      isolationLanguageDetected: true,
      paymentRequestDetected: true,
      photoSolicitationDetected: true,
      moveToPrivateChannelDetected: true,
      piiEscalationDetected: true,
    });
    expect(s.riskScore).toBe(100);
    expect(s.riskLevel).toBe('CRITICAL');
  });

  it('breakdown explains each contributing flag', () => {
    const s = scoreGroomingCheck({
      ageGapSignal: 'AGE_GAP_MODERATE',
      relationshipDurationDays: 7,
      isolationLanguageDetected: true,
      paymentRequestDetected: true,
    });
    const keys = s.breakdown.map((b) => b.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        'age_gap',
        'relationship_duration',
        'isolationLanguageDetected',
        'paymentRequestDetected',
      ]),
    );
  });

  it('omits a flag from the breakdown when it scores zero', () => {
    const s = scoreGroomingCheck({
      ageGapSignal: 'AGES_BOTH_VERIFIED_ADULT',
      loveBombingDetected: false,
    });
    // No entry for "age_gap" (0 pts) and no entry for the false flag
    expect(s.breakdown).toEqual([]);
  });
});
