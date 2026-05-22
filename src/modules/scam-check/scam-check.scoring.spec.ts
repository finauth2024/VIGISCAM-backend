import { scoreScamCheck } from './scam-check.scoring';

describe('scam-check scoring', () => {
  it('scores a clean indicator as LOW', () => {
    const r = scoreScamCheck({ registryListed: false, signals: [], languageSignalCount: 0 });
    expect(r.score).toBe(0);
    expect(r.level).toBe('LOW');
  });

  it('treats a published registry match as at least 80 (HIGH+)', () => {
    const r = scoreScamCheck({ registryListed: true, signals: [], languageSignalCount: 0 });
    expect(r.score).toBeGreaterThanOrEqual(80);
    expect(['HIGH', 'CRITICAL']).toContain(r.level);
  });

  it('scores by the strongest matching signal status', () => {
    const r = scoreScamCheck({
      registryListed: false,
      signals: [
        { status: 'UNVERIFIED_REPORT', confidenceScore: 20, reportCount: 1 },
        { status: 'PATTERN_MATCH', confidenceScore: 60, reportCount: 1 },
      ],
      languageSignalCount: 0,
    });
    expect(r.score).toBeGreaterThanOrEqual(45);
  });

  it('adds for scam language and caps at 100', () => {
    const r = scoreScamCheck({
      registryListed: true,
      registryConfidence: 100,
      signals: [{ status: 'VERIFIED_SCAM_INTELLIGENCE', confidenceScore: 90, reportCount: 20 }],
      languageSignalCount: 5,
    });
    expect(r.score).toBe(100);
    expect(r.level).toBe('CRITICAL');
  });
});
