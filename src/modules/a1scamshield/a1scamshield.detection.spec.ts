import { detectScamLanguage } from './a1scamshield.detection';

describe('A1SCAMSHIELD basic detection', () => {
  it('returns no matches for benign text', () => {
    const result = detectScamLanguage('Hi, are we still meeting for lunch tomorrow?');
    expect(result.matches).toHaveLength(0);
    expect(result.signals).toHaveLength(0);
  });

  it('detects a scam phrase and maps it to a tactic and signal', () => {
    const result = detectScamLanguage('Please install AnyDesk so I can help you.');
    expect(result.signals).toContain('REMOTE_ACCESS');
    expect(result.tactics).toContain('REMOTE_ACCESS_REQUEST');
  });

  it('is case-insensitive and finds multiple distinct signals', () => {
    const result = detectScamLanguage(
      'You must ACT NOW and move your money to a safe account. Do not tell anyone.',
    );
    expect(result.signals).toEqual(
      expect.arrayContaining(['URGENCY', 'FAKE_AUTHORITY', 'SECRECY']),
    );
  });

  it('de-duplicates repeated signals', () => {
    const result = detectScamLanguage('act now, act now, immediately!');
    expect(result.signals).toEqual(['URGENCY']);
  });
});
