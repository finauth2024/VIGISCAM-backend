import { scoreTellerAssist } from './teller-assist.scorer';

describe('scoreTellerAssist', () => {
  it('a routine ACH to existing payee with stated personal payment scores LOW + PROCEED', () => {
    const s = scoreTellerAssist({
      transactionChannel: 'ACH', // 5
      amountMinor: 50_00, // $50, under $1k -> 0
      recipientType: 'EXISTING_PAYEE', // 0
      customerStatedReason: 'PERSONAL_PAYMENT', // 0
    });
    expect(s.riskLevel).toBe('LOW');
    expect(s.recommendedAction).toBe('PROCEED');
    expect(s.riskScore).toBe(5);
  });

  it('an omitted customer reason adds NONE_GIVEN points (silence is suspicious)', () => {
    const s = scoreTellerAssist({
      transactionChannel: 'ACH', // 5
      amountMinor: 50_00,
      recipientType: 'EXISTING_PAYEE',
    });
    expect(s.riskScore).toBe(15); // 5 + 10 NONE_GIVEN
    expect(s.riskLevel).toBe('LOW');
  });

  it('tech-support-fee reason is a hard-stop CRITICAL regardless of amount', () => {
    const s = scoreTellerAssist({
      transactionChannel: 'INTERNAL_TRANSFER',
      amountMinor: 1_00,
      recipientType: 'EXISTING_PAYEE',
      customerStatedReason: 'TECH_SUPPORT_FEE',
    });
    expect(s.riskLevel).toBe('CRITICAL');
    expect(s.recommendedAction).toBe('REFUSE_AND_ESCALATE_TO_FRAUD');
  });

  it('lottery-or-prize-fee is a hard-stop CRITICAL', () => {
    const s = scoreTellerAssist({
      transactionChannel: 'WIRE_DOMESTIC',
      amountMinor: 200_00,
      recipientType: 'NEW_PAYEE',
      customerStatedReason: 'LOTTERY_OR_PRIZE_FEE',
    });
    expect(s.riskLevel).toBe('CRITICAL');
  });

  it('receiving-instructions-from-caller alone is a hard-stop CRITICAL', () => {
    const s = scoreTellerAssist({
      transactionChannel: 'INTERNAL_TRANSFER',
      amountMinor: 10_00,
      recipientType: 'EXISTING_PAYEE',
      behaviorSignals: ['RECEIVING_INSTRUCTIONS_FROM_CALLER'],
    });
    expect(s.riskLevel).toBe('CRITICAL');
    expect(s.recommendedAction).toBe('REFUSE_AND_ESCALATE_TO_FRAUD');
  });

  it('caps the score at 100 even when raw is higher', () => {
    const s = scoreTellerAssist({
      transactionChannel: 'CRYPTO_PURCHASE', // 30
      amountMinor: 100_000_00, // 25
      recipientType: 'CRYPTO_EXCHANGE', // 25
      customerStatedReason: 'INVESTMENT_OPPORTUNITY', // 25
      behaviorSignals: ['ON_PHONE_DURING_TRANSACTION', 'URGENCY_PRESSURE'], // 15+15
      elderMode: true, // 15
    });
    expect(s.riskScore).toBe(100);
    expect(s.riskLevel).toBe('CRITICAL');
  });

  it('international wire to new foreign payee + investment is HIGH and routed to analyst', () => {
    const s = scoreTellerAssist({
      transactionChannel: 'WIRE_INTERNATIONAL', // 20
      amountMinor: 12_000_00, // 15
      recipientType: 'FOREIGN_PAYEE', // 20
      customerStatedReason: 'INVESTMENT_OPPORTUNITY', // 25
    });
    // 20 + 15 + 20 + 25 = 80 -> CRITICAL (boundary)
    expect(s.riskScore).toBe(80);
    expect(s.riskLevel).toBe('CRITICAL');
    expect(s.recommendedAction).toBe('REFUSE_AND_ESCALATE_TO_FRAUD');
  });

  it('elder-mode customer at MEDIUM is routed to family rather than just verbal verify', () => {
    const s = scoreTellerAssist({
      transactionChannel: 'WIRE_DOMESTIC', // 10
      amountMinor: 6_000_00, // 10
      recipientType: 'NEW_PAYEE', // 10
      elderMode: true, // 15
    });
    // 10 + 10 + 10 + 15 = 45 -> MEDIUM
    expect(s.riskLevel).toBe('MEDIUM');
    expect(s.recommendedAction).toBe('CALL_FAMILY_OR_TRUSTED_CONTACT');
  });

  it('produces an auditable line-by-line breakdown', () => {
    const s = scoreTellerAssist({
      transactionChannel: 'WIRE_INTERNATIONAL',
      amountMinor: 5_000_00,
      recipientType: 'FOREIGN_PAYEE',
      customerStatedReason: 'BUSINESS_INVOICE',
      behaviorSignals: ['DISTRESSED', 'CONFUSED'],
    });
    const keys = s.breakdown.map((b) => b.key);
    expect(keys).toContain('channel');
    expect(keys).toContain('recipient');
    expect(keys).toContain('customer_stated_reason');
    expect(keys).toContain('amount_band');
    expect(keys).toContain('behavior:DISTRESSED');
    expect(keys).toContain('behavior:CONFUSED');
    expect(s.breakdown.reduce((acc, b) => acc + b.points, 0)).toBeGreaterThanOrEqual(s.riskScore);
  });
});
