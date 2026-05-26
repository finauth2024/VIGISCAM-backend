import { classifyWithStub, STUB_MODEL_VERSION } from './nlp-stub';

describe('NLP stub classifier', () => {
  it('flags a bank-impersonation phrase', () => {
    const out = classifyWithStub({
      text: 'Your account is locked, move funds to a safe account immediately.',
    });
    expect(out.category).toBe('BANK_IMPERSONATION');
    expect(out.manipulationTactics).toContain('urgency');
    expect(out.scamScore).toBeGreaterThanOrEqual(40);
    expect(out.modelVersion).toBe(STUB_MODEL_VERSION);
  });

  it('detects a gift-card scam with secrecy pressure', () => {
    const out = classifyWithStub({
      text: 'Buy a Google Play card, read me the code, do not tell anyone.',
    });
    expect(out.category).toBe('GIFT_CARD_SCAM');
    expect(out.manipulationTactics).toEqual(expect.arrayContaining(['secrecy']));
  });

  it('never exceeds the stub confidence cap (70)', () => {
    const out = classifyWithStub({
      text:
        'Microsoft support needs remote access right now or your account is suspended — official IRS warrant, do not tell anyone, buy a gift card.',
    });
    expect(out.scamScore).toBeLessThanOrEqual(70);
    expect(out.categoryConfidence).toBeLessThanOrEqual(70);
  });

  it('falls back to the caller-provided hinted category when no rule fires', () => {
    const out = classifyWithStub({
      text: 'Generic message with no scam keywords.',
      hintedCategory: 'OTHER',
    });
    expect(out.category).toBe('OTHER');
    expect(out.categoryConfidence).toBeLessThan(35);
  });

  it('returns no category and a low score for benign text', () => {
    const out = classifyWithStub({ text: 'Reminder: dentist appointment tomorrow at 10am.' });
    expect(out.category).toBeNull();
    expect(out.scamScore).toBeLessThan(30);
    expect(out.manipulationTactics).toEqual([]);
  });
});
