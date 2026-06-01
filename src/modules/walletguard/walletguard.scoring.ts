import { WalletGuardRiskLevel, WalletReputation } from '@prisma/client';

/**
 * Deterministic scorer for WalletGuard (Phase 9D).
 *
 * **Address-invalid is a sentinel**, not a score bump. When the format
 * doesn't parse, the caller skips scoring and goes straight to BLOCKED
 * — there's no point ranking a typo. So `scoreWalletGuard` assumes the
 * address is at least format-valid.
 *
 * Weights:
 *  - Reputation: KNOWN_RISKY / SUSPICIOUS_WALLET / CONFIRMED_SCAM
 *    dominate. NEW gets a small bump (most legitimate destinations are
 *    addresses the user has used before).
 *  - clipboardSwapDetected → +30. The single highest behavioural
 *    signal: the address pasted in differs from what the user copied.
 *  - walletSwitched → +20. The current-session destination changed
 *    mid-flow — classic last-minute swap.
 *  - graphMatchScore (0-100) → up to +30, scaled (graph/3, capped 30).
 *    This is the Phase 9G upgrade input.
 *  - Urgency / secrecy → +15 each.
 *  - Prior CONTINUED_ANYWAY → +5 each capped +20.
 */

const REPUTATION_SCORE: Record<WalletReputation, number> = {
  UNKNOWN: 0,
  NEW: 5,
  KNOWN_RISKY: 35,
  SUSPICIOUS_WALLET: 50,
  CONFIRMED_SCAM: 80,
};

export interface ScoringInput {
  reputation?: WalletReputation;
  clipboardSwapDetected?: boolean;
  walletSwitched?: boolean;
  graphMatchScore?: number | null;
  urgencyDetected?: boolean;
  secrecyDetected?: boolean;
  priorWarningsCount?: number;
}

export interface ScoringResult {
  score: number;
  level: WalletGuardRiskLevel;
  breakdown: Record<string, number>;
}

export function scoreWalletGuard(input: ScoringInput): ScoringResult {
  const breakdown: Record<string, number> = {
    reputation: REPUTATION_SCORE[input.reputation ?? 'UNKNOWN'],
    clipboardSwap: input.clipboardSwapDetected ? 30 : 0,
    walletSwitched: input.walletSwitched ? 20 : 0,
    graphMatch:
      typeof input.graphMatchScore === 'number'
        ? Math.min(30, Math.floor(input.graphMatchScore / 3))
        : 0,
    urgency: input.urgencyDetected ? 15 : 0,
    secrecy: input.secrecyDetected ? 15 : 0,
    priorWarnings: Math.min((input.priorWarningsCount ?? 0) * 5, 20),
  };
  const raw = Object.values(breakdown).reduce((a, b) => a + b, 0);
  const score = Math.min(100, Math.max(0, raw));
  return { score, level: scoreToLevel(score), breakdown };
}

export function scoreToLevel(score: number): WalletGuardRiskLevel {
  if (score >= 86) return 'CRITICAL';
  if (score >= 61) return 'HIGH';
  if (score >= 31) return 'MEDIUM';
  return 'LOW';
}
