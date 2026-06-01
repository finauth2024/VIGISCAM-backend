import { GiftCardGuardImpersonationType, GiftCardGuardRiskLevel } from '@prisma/client';

/**
 * Deterministic scorer for GiftCardGuard (Phase 9C).
 *
 * Every gift-card scan starts with a baseline +25 because gift-card
 * payment requests are the single highest-signal indicator of scam
 * activity in the dataset (brief §1087: any of these *automatically*
 * elevate the risk before context). Detection-side flags push from
 * MEDIUM toward CRITICAL.
 *
 * Output mirrors the ScamHold scorer: a 0-100 score, a level, and a
 * breakdown the UI can show to explain the warning.
 */

export interface ScoringInput {
  codeRevealRequested?: boolean;
  photoOfCodeRequested?: boolean;
  impersonationType?: GiftCardGuardImpersonationType;
  urgencyDetected?: boolean;
  secrecyDetected?: boolean;
  elderModeActive?: boolean;
  priorWarningsCount?: number;
}

export interface ScoringResult {
  score: number;
  level: GiftCardGuardRiskLevel;
  breakdown: Record<string, number>;
}

// Higher-risk impersonation patterns get a heavier weight than diffuse
// "OTHER" — gov/bank/tech-support/law-enforcement is the well-known scam-
// script vocabulary. ROMANCE + EMPLOYER also score high because they map
// onto victim-trust manipulation patterns the brief calls out.
const IMPERSONATION_SCORE: Record<GiftCardGuardImpersonationType, number> = {
  NONE: 0,
  GOVERNMENT: 35,
  BANK: 35,
  TECH_SUPPORT: 35,
  LAW_ENFORCEMENT: 35,
  EMPLOYER: 30,
  ROMANCE: 30,
  UTILITY: 25,
  CHARITY: 20,
  OTHER: 15,
};

export function scoreGiftCardGuard(input: ScoringInput): ScoringResult {
  const breakdown: Record<string, number> = {
    baseline: 25,
    codeReveal: input.codeRevealRequested ? 25 : 0,
    photoOfCode: input.photoOfCodeRequested ? 25 : 0,
    impersonation: IMPERSONATION_SCORE[input.impersonationType ?? 'NONE'],
    urgency: input.urgencyDetected ? 15 : 0,
    secrecy: input.secrecyDetected ? 15 : 0,
    elderMode: input.elderModeActive ? 20 : 0,
    priorWarnings: Math.min((input.priorWarningsCount ?? 0) * 5, 20),
  };
  const raw = Object.values(breakdown).reduce((a, b) => a + b, 0);
  const score = Math.min(100, Math.max(0, raw));
  return { score, level: scoreToLevel(score), breakdown };
}

export function scoreToLevel(score: number): GiftCardGuardRiskLevel {
  if (score >= 86) return 'CRITICAL';
  if (score >= 61) return 'HIGH';
  if (score >= 31) return 'MEDIUM';
  return 'LOW';
}
