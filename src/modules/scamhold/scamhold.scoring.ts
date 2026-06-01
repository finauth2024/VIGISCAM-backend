import { ScamHoldRiskLevel, ScamHoldTransactionType } from '@prisma/client';

/**
 * Deterministic risk scorer (Phase 9B). Inputs map 1:1 to brief §1077:
 *
 *   - transaction type     (CRYPTO/GIFT_CARD highest — irreversible / scammer-favourite)
 *   - amount               (banded; high-amount = high-risk regardless of type)
 *   - recipient risk       (UNKNOWN / NEW / KNOWN_RISKY / SUSPICIOUS_WALLET)
 *   - urgency + secrecy    (verbal-pressure signals from active chat / call)
 *   - active communication (the user is on a live call/chat right now)
 *   - prior warnings       (this user has pushed past N warnings recently)
 *
 * Output: 0–100 score and a breakdown object so the UI can explain
 * **why** a hold fired without exposing internal weights.
 *
 * Real ML score lands as part of Phase 11B (AI workers behind
 * AI_SERVICE_URL); this deterministic stub is the documented fallback
 * per the brief's architecture pattern.
 */

export interface ScoringInput {
  transactionType: ScamHoldTransactionType;
  amountMinor: bigint | number;
  currency: string;
  recipientRisk?: 'UNKNOWN' | 'NEW' | 'KNOWN_RISKY' | 'SUSPICIOUS_WALLET';
  urgencyDetected?: boolean;
  secrecyDetected?: boolean;
  activeCommunication?: boolean;
  priorWarningsCount?: number;
}

export interface ScoringResult {
  score: number;
  level: ScamHoldRiskLevel;
  breakdown: Record<string, number>;
}

const TRANSACTION_TYPE_SCORE: Record<ScamHoldTransactionType, number> = {
  CRYPTO: 25,
  GIFT_CARD: 30, // gift-card scams are the most reliable signal in our data
  WIRE_TRANSFER: 15,
  BANK_TRANSFER: 10,
  PAYMENT_APP: 10,
  ONLINE_PAYMENT: 5,
};

const RECIPIENT_RISK_SCORE: Record<NonNullable<ScoringInput['recipientRisk']>, number> = {
  UNKNOWN: 5,
  NEW: 10,
  KNOWN_RISKY: 30,
  SUSPICIOUS_WALLET: 40,
};

function amountScore(amountMinor: bigint | number, _currency: string): number {
  // Convert to a USD-equivalent approximation in major units. Phase 11B
  // does live FX; here we treat all currencies as USD-equivalent — the
  // `currency` arg is plumbed through for the future FX call.
  const amount = Number(amountMinor) / 100;
  if (amount < 100) return 0;
  if (amount < 1_000) return 5;
  if (amount < 5_000) return 15;
  if (amount < 10_000) return 25;
  return 35;
}

export function scoreScamHold(input: ScoringInput): ScoringResult {
  const breakdown: Record<string, number> = {
    transactionType: TRANSACTION_TYPE_SCORE[input.transactionType],
    amount: amountScore(input.amountMinor, input.currency),
    recipientRisk: RECIPIENT_RISK_SCORE[input.recipientRisk ?? 'UNKNOWN'],
    urgency: input.urgencyDetected ? 15 : 0,
    secrecy: input.secrecyDetected ? 15 : 0,
    activeCommunication: input.activeCommunication ? 10 : 0,
    // Repeat offenders gain +5 per prior warning, capped at +20.
    priorWarnings: Math.min((input.priorWarningsCount ?? 0) * 5, 20),
  };
  const raw = Object.values(breakdown).reduce((a, b) => a + b, 0);
  const score = Math.min(100, Math.max(0, raw));
  return { score, level: scoreToLevel(score), breakdown };
}

export function scoreToLevel(score: number): ScamHoldRiskLevel {
  if (score >= 86) return 'CRITICAL';
  if (score >= 61) return 'HIGH';
  if (score >= 31) return 'MEDIUM';
  return 'LOW';
}
