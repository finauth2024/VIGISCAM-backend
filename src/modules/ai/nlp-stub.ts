import { NlpClassificationInput, NlpClassificationOutput } from './nlp.types';

/**
 * Rule-based fallback for the NLP scam classifier. Lives in-process so the
 * system stays functional when the external Python NLP service is not
 * configured (AI_SERVICE_URL unset) or is unreachable. The classification it
 * produces is intentionally conservative — confidence stays below the
 * "verified" thresholds so a stub verdict never short-circuits human review.
 *
 * Patterns drawn from PDF §33 (detection-rule suggestion examples) and §34
 * (manipulation tactics).
 */

export const STUB_MODEL_VERSION = 'nlp-stub-1.0.0';

interface CategoryPattern {
  category: string;
  patterns: RegExp[];
}

const CATEGORY_PATTERNS: CategoryPattern[] = [
  {
    category: 'BANK_IMPERSONATION',
    patterns: [
      /\bsafe\s+account\b/i,
      /\bverify\s+(your\s+)?account\b/i,
      /\baccount\s+(is\s+)?(locked|suspended|on\s+hold)\b/i,
      /\bbank\s+(security|fraud\s+team)\b/i,
    ],
  },
  {
    category: 'GIFT_CARD_SCAM',
    patterns: [
      /\bgift\s+card(s)?\b/i,
      /\b(google\s+play|itunes|amazon)\s+card\b/i,
      /\b(read|share)\s+(me\s+)?the\s+code\b/i,
    ],
  },
  {
    category: 'REMOTE_ACCESS_SCAM',
    patterns: [
      /\bremote\s+access\b/i,
      /\b(teamviewer|anydesk|logmein)\b/i,
      /\binstall.*(remote|support)\s+tool\b/i,
    ],
  },
  {
    category: 'TECH_SUPPORT_SCAM',
    patterns: [
      /\b(microsoft|apple|windows)\s+(support|technician)\b/i,
      /\byour\s+computer\s+(is\s+)?infected\b/i,
    ],
  },
  {
    category: 'GOVERNMENT_IMPERSONATION',
    patterns: [
      /\b(irs|social\s+security|hmrc|cra)\b/i,
      /\bsocial\s+security\s+(number\s+)?(is\s+)?(suspended|compromised)\b/i,
      /\b(arrest\s+warrant|warrant\s+for\s+your\s+arrest)\b/i,
    ],
  },
  {
    category: 'CRYPTO_SCAM',
    patterns: [
      /\bcrypto\s+(investment|opportunity)\b/i,
      /\bbitcoin\s+(profit|investment)\b/i,
      /\bguaranteed\s+returns?\b/i,
    ],
  },
  {
    category: 'ROMANCE_SCAM',
    patterns: [
      /\bsoulmate\b/i,
      /\bmy\s+(only\s+)?love\b/i,
      /\b(send|wire)\s+(me\s+)?(some\s+)?money\b/i,
    ],
  },
];

interface TacticPattern {
  tactic: string;
  patterns: RegExp[];
}

const TACTIC_PATTERNS: TacticPattern[] = [
  {
    tactic: 'urgency',
    patterns: [
      /\b(urgent|immediately|right\s+now|expires?\s+(today|in\s+\d))\b/i,
      /\b(act\s+now|don.?t\s+wait)\b/i,
    ],
  },
  {
    tactic: 'secrecy',
    patterns: [
      /\b(do\s+not|don.?t)\s+tell\s+(anyone|anybody)\b/i,
      /\bkeep\s+(this\s+)?(a\s+)?secret\b/i,
      /\bbetween\s+(you\s+and\s+)?me\b/i,
    ],
  },
  {
    tactic: 'fake-authority',
    patterns: [
      /\b(official|government|law\s+enforcement|federal|court)\s+(notice|order|action)\b/i,
      /\bon\s+behalf\s+of\b/i,
    ],
  },
  {
    tactic: 'pressure',
    patterns: [
      /\b(or\s+else|otherwise\s+you\s+will|will\s+be\s+(arrested|sued|charged))\b/i,
      /\bfinal\s+(notice|warning)\b/i,
    ],
  },
];

/**
 * Classify a piece of suspicious text against the stub rule set.
 * Pure function — no I/O, no state.
 */
export function classifyWithStub(input: NlpClassificationInput): NlpClassificationOutput {
  const text = input.text ?? '';

  const categoryHits = CATEGORY_PATTERNS.filter(({ patterns }) =>
    patterns.some((p) => p.test(text)),
  );
  const tacticHits = TACTIC_PATTERNS.filter(({ patterns }) =>
    patterns.some((p) => p.test(text)),
  ).map(({ tactic }) => tactic);

  // Honour the caller's hint when the stub finds no stronger signal.
  const category = categoryHits[0]?.category ?? input.hintedCategory ?? null;
  const categoryConfidence = categoryHits.length
    ? Math.min(70, 35 + categoryHits.length * 15)
    : input.hintedCategory
      ? 20
      : 0;

  // Capped at 70 — the stub is deliberately not allowed to look "verified".
  const scamScore = Math.min(
    70,
    (categoryHits.length ? 30 : 10) + categoryHits.length * 12 + tacticHits.length * 8,
  );

  return {
    category,
    categoryConfidence,
    scamScore,
    manipulationTactics: tacticHits,
    modelVersion: STUB_MODEL_VERSION,
  };
}
