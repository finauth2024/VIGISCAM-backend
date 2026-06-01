import { scoreClaimVerify } from './claimverify.scoring';

describe('ClaimVerify scoring', () => {
  it('a CHARITY claim with no signals is LOW (just baseline 10)', () => {
    const r = scoreClaimVerify({ claimType: 'CHARITY' });
    expect(r.score).toBe(10);
    expect(r.level).toBe('LOW');
  });

  it('a ROMANCE claim with image reuse + urgency + secrecy is CRITICAL', () => {
    const r = scoreClaimVerify({
      claimType: 'ROMANCE',
      imageReuseDetected: true,
      urgencyDetected: true,
      secrecyDetected: true,
      paymentPressure: true,
    });
    // 20 + 25 + 15 + 15 + 15 = 90 → CRITICAL
    expect(r.score).toBe(90);
    expect(r.level).toBe('CRITICAL');
  });

  it('OIL_PROJECT + brand-new domain + payment pressure is HIGH', () => {
    const r = scoreClaimVerify({
      claimType: 'OIL_PROJECT',
      domainAgeDays: 5,
      paymentPressure: true,
    });
    // 25 + 20 + 15 = 60 → MEDIUM (just below HIGH cutoff)
    expect(r.score).toBe(60);
    expect(r.level).toBe('MEDIUM');
  });

  it('domain-age scoring bands correctly', () => {
    const ctx = { claimType: 'OTHER' as const };
    expect(scoreClaimVerify({ ...ctx, domainAgeDays: 5 }).breakdown.domainAge).toBe(20);
    expect(scoreClaimVerify({ ...ctx, domainAgeDays: 60 }).breakdown.domainAge).toBe(10);
    expect(scoreClaimVerify({ ...ctx, domainAgeDays: 365 }).breakdown.domainAge).toBe(0);
    expect(scoreClaimVerify({ ...ctx, domainAgeDays: null }).breakdown.domainAge).toBe(0);
    expect(scoreClaimVerify({ ...ctx }).breakdown.domainAge).toBe(0);
  });

  it('scamPhraseScore scales (NLP-score / 3, capped 30)', () => {
    const ctx = { claimType: 'OTHER' as const };
    expect(scoreClaimVerify({ ...ctx, scamPhraseScore: 30 }).breakdown.scamPhraseNlp).toBe(10);
    expect(scoreClaimVerify({ ...ctx, scamPhraseScore: 100 }).breakdown.scamPhraseNlp).toBe(30);
    expect(scoreClaimVerify({ ...ctx, scamPhraseScore: null }).breakdown.scamPhraseNlp).toBe(0);
  });

  it('prior warnings cap at +20', () => {
    expect(
      scoreClaimVerify({ claimType: 'JOB', priorWarningsCount: 100 }).breakdown.priorWarnings,
    ).toBe(20);
    expect(
      scoreClaimVerify({ claimType: 'JOB', priorWarningsCount: 2 }).breakdown.priorWarnings,
    ).toBe(10);
  });

  it('high-baseline types (ROMANCE, INHERITANCE, OIL/GOLD/ROAD) score above mundane ones with same context', () => {
    const baseRomance = scoreClaimVerify({ claimType: 'ROMANCE' });
    const baseJob = scoreClaimVerify({ claimType: 'JOB' });
    expect(baseRomance.score).toBeGreaterThan(baseJob.score);
  });

  it('breakdown sums to score when not capped', () => {
    const r = scoreClaimVerify({
      claimType: 'INVESTMENT',
      domainAgeDays: 45,
      paymentPressure: true,
      scamPhraseScore: 60,
    });
    const sum = Object.values(r.breakdown).reduce((a, b) => a + b, 0);
    expect(sum).toBe(r.score);
  });
});
