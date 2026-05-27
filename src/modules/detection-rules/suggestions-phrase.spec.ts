import { MIN_TACTIC_FREQUENCY, phraseRulesFromTactics, TACTIC_PHRASES } from './suggestions';

describe('phrase-rule suggestions (Phase 6F)', () => {
  it('produces one PHRASE_MATCH rule per tactic that meets the frequency threshold', () => {
    const counts = new Map<string, { frequency: number; totalScamScore: number }>([
      ['urgency', { frequency: 5, totalScamScore: 80 * 5 }],
      ['secrecy', { frequency: 3, totalScamScore: 70 * 3 }],
    ]);
    const rules = phraseRulesFromTactics(counts);
    expect(rules).toHaveLength(2);
    const tactics = rules.map((r) => (r.pattern as { tactic: string }).tactic);
    expect(tactics).toEqual(expect.arrayContaining(['urgency', 'secrecy']));
    expect(rules.every((r) => r.ruleType === 'PHRASE_MATCH')).toBe(true);
  });

  it('skips tactics below the minimum frequency', () => {
    const counts = new Map<string, { frequency: number; totalScamScore: number }>([
      ['urgency', { frequency: MIN_TACTIC_FREQUENCY - 1, totalScamScore: 0 }],
    ]);
    expect(phraseRulesFromTactics(counts)).toHaveLength(0);
  });

  it('skips tactics with no known phrase list', () => {
    const counts = new Map<string, { frequency: number; totalScamScore: number }>([
      ['unknown-tactic', { frequency: 10, totalScamScore: 800 }],
    ]);
    expect(phraseRulesFromTactics(counts)).toHaveLength(0);
  });

  it("uses the tactic's averaged scam score to set severity", () => {
    const counts = new Map<string, { frequency: number; totalScamScore: number }>([
      ['urgency', { frequency: 4, totalScamScore: 90 * 4 }], // avg 90 -> CRITICAL
    ]);
    const r = phraseRulesFromTactics(counts)[0];
    expect(r.severity).toBe('CRITICAL');
  });

  it('embeds the canonical phrase list from TACTIC_PHRASES into the pattern', () => {
    const counts = new Map<string, { frequency: number; totalScamScore: number }>([
      ['secrecy', { frequency: 3, totalScamScore: 60 * 3 }],
    ]);
    const r = phraseRulesFromTactics(counts)[0];
    const pattern = r.pattern as { tactic: string; phrases: string[] };
    expect(pattern.phrases).toEqual(TACTIC_PHRASES.secrecy);
  });
});
