/**
 * A1SCAMSHIELD — Phase 1 basic detection. A deterministic scam-phrase library
 * with substring matching. The production multilingual NLP service replaces /
 * augments this in Phase 6; the contract (phrases -> tactics -> signals) holds.
 */
export interface ScamPhrase {
  /** Lowercased substring to look for. */
  pattern: string;
  /** The manipulation tactic this phrase represents. */
  tactic: string;
  /** The risk signal it contributes to the risk scorer. */
  signal: string;
}

export const SCAM_PHRASE_LIBRARY: ScamPhrase[] = [
  { pattern: 'do not tell anyone', tactic: 'SECRECY', signal: 'SECRECY' },
  { pattern: "don't tell anyone", tactic: 'SECRECY', signal: 'SECRECY' },
  { pattern: 'keep this between us', tactic: 'SECRECY', signal: 'SECRECY' },
  { pattern: 'safe account', tactic: 'FAKE_BANK_INSTRUCTION', signal: 'FAKE_AUTHORITY' },
  { pattern: 'move your money', tactic: 'FAKE_BANK_INSTRUCTION', signal: 'FAKE_AUTHORITY' },
  {
    pattern: 'you are under investigation',
    tactic: 'FAKE_AUTHORITY_THREAT',
    signal: 'FAKE_AUTHORITY',
  },
  { pattern: 'install anydesk', tactic: 'REMOTE_ACCESS_REQUEST', signal: 'REMOTE_ACCESS' },
  { pattern: 'anydesk', tactic: 'REMOTE_ACCESS_REQUEST', signal: 'REMOTE_ACCESS' },
  { pattern: 'teamviewer', tactic: 'REMOTE_ACCESS_REQUEST', signal: 'REMOTE_ACCESS' },
  { pattern: 'gift card', tactic: 'GIFT_CARD_DEMAND', signal: 'GIFT_CARD_REQUEST' },
  { pattern: 'read me the code', tactic: 'GIFT_CARD_DEMAND', signal: 'GIFT_CARD_REQUEST' },
  { pattern: 'arrest', tactic: 'THREAT', signal: 'THREAT_LANGUAGE' },
  { pattern: 'warrant', tactic: 'THREAT', signal: 'THREAT_LANGUAGE' },
  { pattern: 'legal action', tactic: 'THREAT', signal: 'THREAT_LANGUAGE' },
  { pattern: 'act now', tactic: 'URGENCY', signal: 'URGENCY' },
  { pattern: 'right now', tactic: 'URGENCY', signal: 'URGENCY' },
  { pattern: 'immediately', tactic: 'URGENCY', signal: 'URGENCY' },
  { pattern: 'before it is too late', tactic: 'URGENCY', signal: 'URGENCY' },
  { pattern: 'send crypto', tactic: 'CRYPTO_DEMAND', signal: 'CRYPTO_TRANSFER' },
  { pattern: 'bitcoin', tactic: 'CRYPTO_DEMAND', signal: 'CRYPTO_TRANSFER' },
  { pattern: 'wire transfer', tactic: 'PAYMENT_DEMAND', signal: 'PAYMENT_PRESSURE' },
  { pattern: 'do not hang up', tactic: 'ISOLATION', signal: 'ISOLATION' },
  { pattern: 'do not call your bank', tactic: 'ISOLATION', signal: 'ISOLATION' },
  { pattern: 'do not talk to your family', tactic: 'ISOLATION', signal: 'ISOLATION' },
];

export interface PhraseMatch {
  phrase: string;
  tactic: string;
}

export interface ScamLanguageResult {
  matches: PhraseMatch[];
  tactics: string[];
  signals: string[];
}

/** Scan text against the phrase library; return matches, tactics and signals. */
export function detectScamLanguage(text: string): ScamLanguageResult {
  const haystack = text.toLowerCase();
  const matches: PhraseMatch[] = [];
  const tactics = new Set<string>();
  const signals = new Set<string>();

  for (const entry of SCAM_PHRASE_LIBRARY) {
    if (haystack.includes(entry.pattern)) {
      matches.push({ phrase: entry.pattern, tactic: entry.tactic });
      tactics.add(entry.tactic);
      signals.add(entry.signal);
    }
  }
  return { matches, tactics: [...tactics], signals: [...signals] };
}
