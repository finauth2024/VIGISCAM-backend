import { RiskLevel } from '@prisma/client';

/**
 * Phase 1 unified risk scoring — a deterministic, rule-based scorer. Each known
 * signal contributes a weight; the total is capped to the 0–100 scale. AI-fed
 * fusion (A1SCAMSHIELD, VictimState, etc.) replaces/augments this in Phase 6.
 */
const SIGNAL_WEIGHTS: Record<string, number> = {
  REMOTE_ACCESS: 25,
  GIFT_CARD_REQUEST: 25,
  CRYPTO_TRANSFER: 20,
  WALLET_SWITCH: 20,
  FAKE_AUTHORITY: 20,
  THREAT_LANGUAGE: 20,
  URGENCY: 15,
  SECRECY: 15,
  ROMANCE_PRESSURE: 15,
  PAYMENT_PRESSURE: 15,
  ISOLATION: 15,
  ELDER_TARGETED: 10,
};
const UNKNOWN_SIGNAL_WEIGHT = 5;

/** Sum the weights of the detected signals, clamped to 0–100. */
export function scoreSignals(signals: string[]): number {
  const raw = signals.reduce(
    (sum, signal) => sum + (SIGNAL_WEIGHTS[signal] ?? UNKNOWN_SIGNAL_WEIGHT),
    0,
  );
  return Math.min(100, Math.max(0, raw));
}

/** Map a 0–100 score to a risk level (docs/01 §B.7). */
export function levelForScore(score: number): RiskLevel {
  if (score >= 86) return 'CRITICAL';
  if (score >= 61) return 'HIGH';
  if (score >= 31) return 'MEDIUM';
  return 'LOW';
}

/** The recommended action for a given risk level. */
export function recommendedActionForLevel(level: RiskLevel): string {
  switch (level) {
    case 'CRITICAL':
      return 'TRIGGER_INTERVENTION';
    case 'HIGH':
      return 'REQUIRE_VERIFICATION';
    case 'MEDIUM':
      return 'WARN_USER';
    default:
      return 'MONITOR';
  }
}
