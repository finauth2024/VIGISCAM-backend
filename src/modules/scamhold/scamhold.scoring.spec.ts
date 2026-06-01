import { scoreScamHold, scoreToLevel } from './scamhold.scoring';

describe('ScamHold scoring', () => {
  describe('scoreToLevel banding', () => {
    it('maps 0..30 → LOW', () => {
      expect(scoreToLevel(0)).toBe('LOW');
      expect(scoreToLevel(30)).toBe('LOW');
    });
    it('maps 31..60 → MEDIUM', () => {
      expect(scoreToLevel(31)).toBe('MEDIUM');
      expect(scoreToLevel(60)).toBe('MEDIUM');
    });
    it('maps 61..85 → HIGH', () => {
      expect(scoreToLevel(61)).toBe('HIGH');
      expect(scoreToLevel(85)).toBe('HIGH');
    });
    it('maps 86..100 → CRITICAL', () => {
      expect(scoreToLevel(86)).toBe('CRITICAL');
      expect(scoreToLevel(100)).toBe('CRITICAL');
    });
  });

  it('a small online payment with no signals lands LOW', () => {
    const r = scoreScamHold({
      transactionType: 'ONLINE_PAYMENT',
      amountMinor: 5_000, // $50.00
      currency: 'USD',
    });
    // transactionType 5 + amount 0 + recipientRisk 5 = 10 → LOW
    expect(r.score).toBe(10);
    expect(r.level).toBe('LOW');
  });

  it('a $1k crypto transfer to a suspicious wallet with urgency + secrecy is CRITICAL', () => {
    const r = scoreScamHold({
      transactionType: 'CRYPTO',
      amountMinor: 100_000, // $1,000
      currency: 'USD',
      recipientRisk: 'SUSPICIOUS_WALLET',
      urgencyDetected: true,
      secrecyDetected: true,
      activeCommunication: true,
    });
    // 25 (CRYPTO) + 15 ($1k band) + 40 (suspicious wallet) + 15 + 15 + 10
    // = 120 → capped 100 → CRITICAL
    expect(r.score).toBe(100);
    expect(r.level).toBe('CRITICAL');
    expect(r.breakdown.urgency).toBe(15);
    expect(r.breakdown.recipientRisk).toBe(40);
  });

  it('a gift-card $500 with urgency is HIGH (>= 61)', () => {
    const r = scoreScamHold({
      transactionType: 'GIFT_CARD',
      amountMinor: 50_000, // $500
      currency: 'USD',
      recipientRisk: 'KNOWN_RISKY',
      urgencyDetected: true,
    });
    // 30 + 5 + 30 + 15 + 0 + 0 + 0 = 80 → HIGH
    expect(r.score).toBe(80);
    expect(r.level).toBe('HIGH');
  });

  it('prior warnings increment the score (capped at +20)', () => {
    const base = scoreScamHold({
      transactionType: 'BANK_TRANSFER',
      amountMinor: 100_000,
      currency: 'USD',
    });
    const sevenPriors = scoreScamHold({
      transactionType: 'BANK_TRANSFER',
      amountMinor: 100_000,
      currency: 'USD',
      priorWarningsCount: 7, // 7 * 5 = 35, capped at 20
    });
    expect(sevenPriors.score - base.score).toBe(20);
  });

  it('breakdown adds up to the score (no hidden weights)', () => {
    const r = scoreScamHold({
      transactionType: 'WIRE_TRANSFER',
      amountMinor: 750_000, // $7,500
      currency: 'USD',
      recipientRisk: 'NEW',
      urgencyDetected: true,
      priorWarningsCount: 2,
    });
    const sum = Object.values(r.breakdown).reduce((a, b) => a + b, 0);
    expect(sum).toBe(r.score);
  });
});
