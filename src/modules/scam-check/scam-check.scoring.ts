import { RiskLevel } from '@prisma/client';
import { levelForScore } from '../risk-fusion/risk.scoring';

/**
 * Scoring for the public scam check (PDF §16.4). Combines three sources:
 *  - a published public-registry match (verified intelligence — strongest),
 *  - internal scam signals matching the indicator (used to score only),
 *  - scam-language detected in any submitted text.
 */

/** How much each signal status contributes to a scam-check score. */
const STATUS_WEIGHT: Record<string, number> = {
  VERIFIED_SCAM_INTELLIGENCE: 75,
  PUBLIC_SAFE_ALERT: 75,
  HIGH_RISK_INDICATOR: 65,
  PATTERN_MATCH: 45,
  UNDER_REVIEW: 35,
  SUSPICIOUS_SIGNAL: 30,
  UNVERIFIED_REPORT: 15,
  ARCHIVED: 5,
  REJECTED: 0,
};

export interface SignalMatch {
  status: string;
  confidenceScore: number;
  reportCount: number;
}

export interface ScamCheckScoreInput {
  registryListed: boolean;
  registryConfidence?: number;
  signals: SignalMatch[];
  languageSignalCount: number;
}

export function scoreScamCheck(input: ScamCheckScoreInput): { score: number; level: RiskLevel } {
  let score = 0;

  // A published registry entry is verified, public-safe intelligence — strongest.
  if (input.registryListed) {
    score = Math.max(score, Math.max(80, input.registryConfidence ?? 0));
  }

  // Internal signals: take the strongest matching status, then add for volume.
  if (input.signals.length > 0) {
    const strongest = input.signals.reduce((best, s) =>
      (STATUS_WEIGHT[s.status] ?? 0) > (STATUS_WEIGHT[best.status] ?? 0) ? s : best,
    );
    score = Math.max(score, STATUS_WEIGHT[strongest.status] ?? 0);
    const totalReports = input.signals.reduce((sum, s) => sum + s.reportCount, 0);
    score += Math.min(15, totalReports * 2);
  }

  // Scam language detected in the submitted text.
  score += Math.min(20, input.languageSignalCount * 8);

  score = Math.min(100, Math.max(0, score));
  return { score, level: levelForScore(score) };
}
