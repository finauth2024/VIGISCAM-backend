/**
 * Phase 10B — teller-assist deterministic scorer.
 *
 * Same shape as the Phase 9 scorers: closed input set, additive points,
 * cap at 100, fixed bucket boundaries. This means the score is
 * reproducible for any given input and the breakdown is auditable
 * line-by-line — a bank's compliance team can defend each point
 * contribution if a customer disputes a flagged interaction.
 *
 * Inputs are framed from the *teller's* perspective at the counter:
 * a customer is in front of them, asking to move money, and the teller
 * captures what they observe. The scorer turns that observation set
 * into a recommended action.
 *
 * Replaced by a real model in Phase 11B; until then the breakdown is
 * the model card.
 */

export type TellerTransactionChannel =
  | 'INTERNAL_TRANSFER'
  | 'ACH'
  | 'WIRE_DOMESTIC'
  | 'WIRE_INTERNATIONAL'
  | 'CRYPTO_PURCHASE'
  | 'GIFT_CARD_PURCHASE'
  | 'CASH_WITHDRAWAL'
  | 'CHECK';

export type TellerRecipientType =
  | 'EXISTING_PAYEE'
  | 'NEW_PAYEE'
  | 'FOREIGN_PAYEE'
  | 'BUSINESS_NEW'
  | 'CRYPTO_EXCHANGE'
  | 'PEER_TO_PEER_APP'
  | 'UNKNOWN';

export type TellerCustomerStatedReason =
  | 'NONE_GIVEN'
  | 'PERSONAL_PAYMENT'
  | 'INVESTMENT_OPPORTUNITY'
  | 'GOVERNMENT_FEE_OR_FINE'
  | 'TECH_SUPPORT_FEE'
  | 'FAMILY_EMERGENCY'
  | 'ROMANTIC_PARTNER'
  | 'LOTTERY_OR_PRIZE_FEE'
  | 'BUSINESS_INVOICE'
  | 'CHARITY'
  | 'OTHER';

export type TellerBehaviorSignal =
  | 'DISTRESSED'
  | 'CONFUSED'
  | 'ON_PHONE_DURING_TRANSACTION'
  | 'RECEIVING_INSTRUCTIONS_FROM_CALLER'
  | 'COACHED_RESPONSES'
  | 'REFUSED_TO_EXPLAIN'
  | 'FIRST_TIME_LARGE_TRANSFER'
  | 'ELDERLY_AND_PRESSURED'
  | 'SECRECY_REQUESTED'
  | 'URGENCY_PRESSURE';

export type TellerAssistRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type TellerRecommendedAction =
  | 'PROCEED'
  | 'VERIFY_VERBALLY'
  | 'CALL_FAMILY_OR_TRUSTED_CONTACT'
  | 'DELAY_AND_ESCALATE_TO_ANALYST'
  | 'REFUSE_AND_ESCALATE_TO_FRAUD';

export interface TellerAssistInput {
  transactionChannel: TellerTransactionChannel;
  amountMinor: bigint | number;
  recipientType: TellerRecipientType;
  customerStatedReason?: TellerCustomerStatedReason;
  behaviorSignals?: TellerBehaviorSignal[];
  /** True if the bank has marked this customer as elderly / "Elder Mode". */
  elderMode?: boolean;
}

export interface TellerAssistScoring {
  riskScore: number;
  riskLevel: TellerAssistRiskLevel;
  recommendedAction: TellerRecommendedAction;
  breakdown: Array<{ key: string; points: number; reason: string }>;
}

const CHANNEL_POINTS: Record<TellerTransactionChannel, number> = {
  INTERNAL_TRANSFER: 0,
  ACH: 5,
  WIRE_DOMESTIC: 10,
  WIRE_INTERNATIONAL: 20,
  CRYPTO_PURCHASE: 30,
  GIFT_CARD_PURCHASE: 30,
  CASH_WITHDRAWAL: 10,
  CHECK: 5,
};

const RECIPIENT_POINTS: Record<TellerRecipientType, number> = {
  EXISTING_PAYEE: 0,
  NEW_PAYEE: 10,
  FOREIGN_PAYEE: 20,
  BUSINESS_NEW: 15,
  CRYPTO_EXCHANGE: 25,
  PEER_TO_PEER_APP: 15,
  UNKNOWN: 10,
};

const REASON_POINTS: Record<TellerCustomerStatedReason, number> = {
  NONE_GIVEN: 10,
  PERSONAL_PAYMENT: 0,
  INVESTMENT_OPPORTUNITY: 25,
  GOVERNMENT_FEE_OR_FINE: 35,
  TECH_SUPPORT_FEE: 35,
  FAMILY_EMERGENCY: 20,
  ROMANTIC_PARTNER: 25,
  LOTTERY_OR_PRIZE_FEE: 40,
  BUSINESS_INVOICE: 5,
  CHARITY: 10,
  OTHER: 5,
};

// Behavior signals are the strongest predictor in the dataset — high points.
const BEHAVIOR_POINTS: Record<TellerBehaviorSignal, number> = {
  DISTRESSED: 10,
  CONFUSED: 10,
  ON_PHONE_DURING_TRANSACTION: 15,
  RECEIVING_INSTRUCTIONS_FROM_CALLER: 35,
  COACHED_RESPONSES: 25,
  REFUSED_TO_EXPLAIN: 20,
  FIRST_TIME_LARGE_TRANSFER: 15,
  ELDERLY_AND_PRESSURED: 25,
  SECRECY_REQUESTED: 20,
  URGENCY_PRESSURE: 15,
};

// Amount thresholds in USD-equivalent minor units (cents). Currency
// conversion is out of scope for the scorer — it operates on whatever
// minor-unit value the caller passed.
function amountBandPoints(amountMinor: bigint): number {
  const cents = Number(amountMinor);
  if (cents >= 50_000_00) return 25; // $50k+
  if (cents >= 10_000_00) return 15; // $10k+
  if (cents >= 5_000_00) return 10; // $5k+
  if (cents >= 1_000_00) return 5; // $1k+
  return 0;
}

export function scoreTellerAssist(input: TellerAssistInput): TellerAssistScoring {
  const breakdown: TellerAssistScoring['breakdown'] = [];

  const channelPts = CHANNEL_POINTS[input.transactionChannel] ?? 0;
  if (channelPts > 0) {
    breakdown.push({
      key: 'channel',
      points: channelPts,
      reason: `Channel "${input.transactionChannel}" carries baseline risk`,
    });
  }

  const recipientPts = RECIPIENT_POINTS[input.recipientType] ?? 0;
  if (recipientPts > 0) {
    breakdown.push({
      key: 'recipient',
      points: recipientPts,
      reason: `Recipient classification "${input.recipientType}"`,
    });
  }

  const reason = input.customerStatedReason ?? 'NONE_GIVEN';
  const reasonPts = REASON_POINTS[reason] ?? 0;
  if (reasonPts > 0) {
    breakdown.push({
      key: 'customer_stated_reason',
      points: reasonPts,
      reason: `Customer stated reason "${reason}" — known scammer-favoured framing`,
    });
  }

  const amount =
    typeof input.amountMinor === 'bigint' ? input.amountMinor : BigInt(input.amountMinor);
  const amountPts = amountBandPoints(amount);
  if (amountPts > 0) {
    breakdown.push({
      key: 'amount_band',
      points: amountPts,
      reason: `Amount band — larger transfers correlate with higher scam losses`,
    });
  }

  let behaviorTotal = 0;
  for (const sig of input.behaviorSignals ?? []) {
    const pts = BEHAVIOR_POINTS[sig] ?? 0;
    if (pts > 0) {
      breakdown.push({
        key: `behavior:${sig}`,
        points: pts,
        reason: `Behavior signal observed: ${sig}`,
      });
      behaviorTotal += pts;
    }
  }

  // Elder Mode multiplier — applied as a flat bonus, not a multiplier,
  // so the breakdown stays auditable line-by-line.
  if (input.elderMode) {
    breakdown.push({
      key: 'elder_mode',
      points: 15,
      reason: 'Customer is registered in Elder Mode — extra protective weighting',
    });
  }

  const raw = breakdown.reduce((acc, b) => acc + b.points, 0);
  const riskScore = Math.min(100, raw);

  // Two of the highest-signal behaviors immediately tip CRITICAL,
  // regardless of overall score — these are the "stop now" indicators.
  const hardStop =
    (input.behaviorSignals ?? []).includes('RECEIVING_INSTRUCTIONS_FROM_CALLER') ||
    reason === 'LOTTERY_OR_PRIZE_FEE' ||
    reason === 'TECH_SUPPORT_FEE';

  const riskLevel: TellerAssistRiskLevel = hardStop
    ? 'CRITICAL'
    : riskScore >= 80
      ? 'CRITICAL'
      : riskScore >= 60
        ? 'HIGH'
        : riskScore >= 30
          ? 'MEDIUM'
          : 'LOW';

  const recommendedAction: TellerRecommendedAction =
    riskLevel === 'CRITICAL'
      ? 'REFUSE_AND_ESCALATE_TO_FRAUD'
      : riskLevel === 'HIGH'
        ? 'DELAY_AND_ESCALATE_TO_ANALYST'
        : riskLevel === 'MEDIUM'
          ? input.elderMode || behaviorTotal >= 25
            ? 'CALL_FAMILY_OR_TRUSTED_CONTACT'
            : 'VERIFY_VERBALLY'
          : 'PROCEED';

  return { riskScore, riskLevel, recommendedAction, breakdown };
}
