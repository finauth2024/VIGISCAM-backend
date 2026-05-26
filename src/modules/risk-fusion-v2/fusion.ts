import {
  AuthenticityResult,
  FraudJourneyStage,
  PredictedAction,
  RiskLevel,
  VictimStateLabel,
} from '@prisma/client';
import { levelForScore } from '../risk-fusion/risk.scoring';

/**
 * Risk Fusion v2 (PDF §45 RiskFusionService). Combines the existing live
 * risk score with the four Phase 6 AI signal layers — fraud-journey stage,
 * victim-state, predicted-next-move, and authenticity verdicts — into a
 * single explainable score. The full breakdown is stored alongside the
 * fused score so every contributing layer is auditable (PDF #8 + #13).
 */

export const RISK_FUSION_V2_VERSION = 'risk-fusion-v2-1.0.0';

const STAGE_WEIGHT: Record<FraudJourneyStage, number> = {
  INITIAL_CONTACT: 5,
  TRUST_BUILDING: 10,
  INFORMATION_GATHERING: 20,
  URGENCY_INJECTION: 25,
  PAYMENT_REQUEST: 30,
  COMPLETED: 30,
  INTERVENED: 0,
};

const STATE_WEIGHT: Record<VictimStateLabel, number> = {
  CALM: 0,
  CONFUSED: 10,
  PRESSURED: 15,
  TRUSTING: 12,
  ALARMED: 20,
  COMPROMISED: 25,
};

const ACTION_WEIGHT: Record<PredictedAction, number> = {
  REQUEST_PAYMENT: 20,
  REQUEST_REMOTE_ACCESS: 18,
  REQUEST_GIFT_CARD: 18,
  REQUEST_PERSONAL_INFO: 12,
  ESCALATE_URGENCY: 10,
  DROP_OFF: 0,
};

export interface FusionInput {
  baseScore: number;
  stage: FraudJourneyStage;
  victimState: VictimStateLabel;
  predictedAction: PredictedAction;
  authenticityFailures: number; // count of FAIL verdicts on the session
}

export interface FusionBreakdown {
  baseScore: number;
  fraudJourneyBoost: number;
  victimStateBoost: number;
  predictedMoveBoost: number;
  authenticityPenalty: number;
  stage: FraudJourneyStage;
  victimState: VictimStateLabel;
  predictedAction: PredictedAction;
  authenticityFailures: number;
}

export interface FusionResult {
  fusedScore: number;
  fusedLevel: RiskLevel;
  breakdown: FusionBreakdown;
  fusedVersion: string;
}

/** Pure fusion function — no I/O, no state. Easy to unit-test. */
export function fuseRiskScore(input: FusionInput): FusionResult {
  const fraudJourneyBoost = STAGE_WEIGHT[input.stage] ?? 0;
  const victimStateBoost = STATE_WEIGHT[input.victimState] ?? 0;
  const predictedMoveBoost = ACTION_WEIGHT[input.predictedAction] ?? 0;
  // Each FAILed authenticity check adds 15, capped at 30.
  const authenticityPenalty = Math.min(30, Math.max(0, input.authenticityFailures) * 15);

  const summed =
    input.baseScore +
    fraudJourneyBoost +
    victimStateBoost +
    predictedMoveBoost +
    authenticityPenalty;
  const fusedScore = Math.max(0, Math.min(100, summed));

  return {
    fusedScore,
    fusedLevel: levelForScore(fusedScore),
    breakdown: {
      baseScore: input.baseScore,
      fraudJourneyBoost,
      victimStateBoost,
      predictedMoveBoost,
      authenticityPenalty,
      stage: input.stage,
      victimState: input.victimState,
      predictedAction: input.predictedAction,
      authenticityFailures: input.authenticityFailures,
    },
    fusedVersion: RISK_FUSION_V2_VERSION,
  };
}
