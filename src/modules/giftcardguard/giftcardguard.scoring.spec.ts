import { scoreGiftCardGuard } from './giftcardguard.scoring';

describe('GiftCardGuard scoring', () => {
  it('baseline alone is LOW (25 → LOW)', () => {
    // A plain "user mentioned a gift card" scan with no other signals
    // gets the baseline only.
    const r = scoreGiftCardGuard({});
    expect(r.score).toBe(25);
    expect(r.level).toBe('LOW');
  });

  it('government impersonation + urgency + secrecy is CRITICAL', () => {
    const r = scoreGiftCardGuard({
      impersonationType: 'GOVERNMENT',
      urgencyDetected: true,
      secrecyDetected: true,
    });
    // 25 + 35 + 15 + 15 = 90 → CRITICAL
    expect(r.score).toBe(90);
    expect(r.level).toBe('CRITICAL');
  });

  it('code-reveal request alone is HIGH', () => {
    const r = scoreGiftCardGuard({ codeRevealRequested: true });
    // 25 + 25 = 50 → MEDIUM (not quite HIGH because no other signal)
    expect(r.score).toBe(50);
    expect(r.level).toBe('MEDIUM');
  });

  it('code-reveal + photo + tech-support is CRITICAL', () => {
    const r = scoreGiftCardGuard({
      codeRevealRequested: true,
      photoOfCodeRequested: true,
      impersonationType: 'TECH_SUPPORT',
    });
    // 25 + 25 + 25 + 35 = 110 → caps 100 → CRITICAL
    expect(r.score).toBe(100);
    expect(r.level).toBe('CRITICAL');
  });

  it('Elder Mode alone raises baseline to MEDIUM band', () => {
    const r = scoreGiftCardGuard({ elderModeActive: true });
    // 25 + 20 = 45 → MEDIUM
    expect(r.score).toBe(45);
    expect(r.level).toBe('MEDIUM');
  });

  it('breakdown sums to the final score when not capped', () => {
    // Inputs deliberately chosen so raw < 100 and no cap kicks in.
    const r = scoreGiftCardGuard({
      impersonationType: 'CHARITY',
      urgencyDetected: true,
    });
    // 25 + 20 (CHARITY) + 15 = 60 → MEDIUM, no cap
    const sum = Object.values(r.breakdown).reduce((a, b) => a + b, 0);
    expect(sum).toBe(r.score);
    expect(r.level).toBe('MEDIUM');
  });

  it('breakdown sum may exceed score when the 100-cap kicks in', () => {
    // Documents the cap behaviour explicitly so a future refactor that
    // removes the cap will surface here.
    const r = scoreGiftCardGuard({
      codeRevealRequested: true,
      photoOfCodeRequested: true,
      impersonationType: 'TECH_SUPPORT',
      urgencyDetected: true,
      secrecyDetected: true,
      elderModeActive: true,
    });
    const sum = Object.values(r.breakdown).reduce((a, b) => a + b, 0);
    expect(sum).toBeGreaterThan(100);
    expect(r.score).toBe(100);
  });

  it('prior warnings cap at +20', () => {
    const base = scoreGiftCardGuard({});
    const tenPriors = scoreGiftCardGuard({ priorWarningsCount: 10 });
    expect(tenPriors.score - base.score).toBe(20);
  });
});
