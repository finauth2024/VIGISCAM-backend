/**
 * ScamMirror tactic detector (Phase 9F).
 *
 * Lightweight keyword/phrase matching that tags each conversation turn
 * with the manipulation tactics it exhibits. Output feeds:
 *   1. The session's cumulative `tacticsObserved` (the learning
 *      signal — see brief §1135).
 *   2. ScamScript Genome (Phase 4) when the session ends ENDED_LEARNED.
 *
 * Phase 11B swaps this for the real A1SCAMSHIELD NLP pass.
 * The deterministic list here exists so the module ships without
 * waiting on the AI worker — and so tactic taxonomy is stable across
 * the rule-based and ML eras.
 */

export type Tactic =
  | 'URGENCY'
  | 'SECRECY'
  | 'AUTHORITY'
  | 'ISOLATION'
  | 'REWARD'
  | 'THREAT'
  | 'EMOTIONAL_PRESSURE';

const PATTERNS: Array<{ tactic: Tactic; re: RegExp }> = [
  // URGENCY — time pressure
  {
    tactic: 'URGENCY',
    re: /\b(right\s*now|immediately|asap|urgent(?:ly)?|today\s*only|limited\s*time|hurry|quickly|act\s*fast)\b/i,
  },
  // SECRECY — keep this hidden
  {
    tactic: 'SECRECY',
    re: /\b(don'?t\s*tell|between\s*us|keep\s*(?:this|it)\s*(?:secret|confidential|private)|nobody\s*can\s*know)\b/i,
  },
  // AUTHORITY — fake credentials, gov/bank impersonation
  {
    tactic: 'AUTHORITY',
    re: /\b(officer|agent|i\s*am\s*from|irs|fbi|police|sheriff|federal|court|tax\s*authority|customs)\b/i,
  },
  // ISOLATION — cut you off from your trusted contacts
  {
    tactic: 'ISOLATION',
    re: /\b(don'?t\s*trust\s*(?:them|him|her|anyone)|they(?:'ll|\s*will)?\s*lie|nobody\s*believes\s*you|stay\s*on\s*the\s*line|don'?t\s*hang\s*up)\b/i,
  },
  // REWARD — easy money, you won
  {
    tactic: 'REWARD',
    re: /\b(you\s*(?:won|have\s*won)|congratulations|prize|free\s*money|inheritance|lottery|grant)\b/i,
  },
  // THREAT — bad things if you don't comply
  {
    tactic: 'THREAT',
    re: /\b(arrest|lawsuit|jail|prison|deport(?:ation|ed)?|fine|warrant|legal\s*action)\b/i,
  },
  // EMOTIONAL_PRESSURE — guilt / fear / love bombing
  {
    tactic: 'EMOTIONAL_PRESSURE',
    re: /\b(my\s*(?:family|child|mother|father|son|daughter)\s*(?:is|are)\s*(?:dying|sick|in\s*trouble)|i\s*love\s*you|trust\s*me\s*please|you'?re\s*my\s*only\s*hope)\b/i,
  },
];

export function detectTactics(text: string): Tactic[] {
  const found = new Set<Tactic>();
  for (const { tactic, re } of PATTERNS) {
    if (re.test(text)) found.add(tactic);
  }
  return [...found];
}
