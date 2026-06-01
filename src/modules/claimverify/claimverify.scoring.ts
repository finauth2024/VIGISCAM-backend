import { ClaimVerifyRiskLevel, ClaimVerifyType } from '@prisma/client';

/**
 * Deterministic scorer for ClaimVerify (Phase 9E).
 *
 * **Two-layer score.** A per-claim-type baseline reflects how
 * fraud-heavy that claim category is in our dataset (ROMANCE +
 * INHERITANCE + OIL/GOLD/ROAD projects dominate; mundane JOB / CHARITY
 * are lower-baseline). Subject signals (domain age, location mismatch,
 * image reuse, NLP scam-phrase score, payment pressure, secrecy,
 * urgency) stack on top of the baseline.
 *
 * Per the brief's architecture pattern, scam-phrase scoring is
 * normally a STUB-fallback NLP pass; the caller injects the actual
 * score 0-100 (or omits it for "haven't checked yet").
 */

const CLAIM_TYPE_BASELINE: Record<ClaimVerifyType, number> = {
  ROMANCE: 20,
  INVESTMENT: 15,
  INHERITANCE: 20,
  OIL_PROJECT: 25,
  GOLD_PROJECT: 25,
  ROAD_CONSTRUCTION: 20,
  BUSINESS_PARTNERSHIP: 15,
  LEGAL_CLAIM: 15,
  IMMIGRATION: 15,
  WORK_FROM_HOME: 15,
  JOB: 10,
  GOVERNMENT: 10,
  HOSPITAL: 10,
  MEDICAL_EMERGENCY: 10,
  CHARITY: 10,
  OTHER: 5,
};

export interface ScoringInput {
  claimType: ClaimVerifyType;
  /** Whois-derived age in days; null when no domain or no lookup. */
  domainAgeDays?: number | null;
  locationMismatch?: boolean;
  imageReuseDetected?: boolean;
  /** 0-100 from upstream A1SCAMSHIELD NLP. Null when unset. */
  scamPhraseScore?: number | null;
  paymentPressure?: boolean;
  secrecyDetected?: boolean;
  urgencyDetected?: boolean;
  priorWarningsCount?: number;
}

export interface ScoringResult {
  score: number;
  level: ClaimVerifyRiskLevel;
  breakdown: Record<string, number>;
}

function domainAgeScore(days: number | null | undefined): number {
  if (typeof days !== 'number') return 0;
  if (days < 30) return 20; // brand-new domain — common scam pattern
  if (days < 90) return 10;
  return 0;
}

export function scoreClaimVerify(input: ScoringInput): ScoringResult {
  const breakdown: Record<string, number> = {
    claimTypeBaseline: CLAIM_TYPE_BASELINE[input.claimType],
    domainAge: domainAgeScore(input.domainAgeDays),
    locationMismatch: input.locationMismatch ? 15 : 0,
    imageReuse: input.imageReuseDetected ? 25 : 0,
    scamPhraseNlp:
      typeof input.scamPhraseScore === 'number'
        ? Math.min(30, Math.floor(input.scamPhraseScore / 3))
        : 0,
    paymentPressure: input.paymentPressure ? 15 : 0,
    secrecy: input.secrecyDetected ? 15 : 0,
    urgency: input.urgencyDetected ? 15 : 0,
    priorWarnings: Math.min((input.priorWarningsCount ?? 0) * 5, 20),
  };
  const raw = Object.values(breakdown).reduce((a, b) => a + b, 0);
  const score = Math.min(100, Math.max(0, raw));
  return { score, level: scoreToLevel(score), breakdown };
}

export function scoreToLevel(score: number): ClaimVerifyRiskLevel {
  if (score >= 86) return 'CRITICAL';
  if (score >= 61) return 'HIGH';
  if (score >= 31) return 'MEDIUM';
  return 'LOW';
}
