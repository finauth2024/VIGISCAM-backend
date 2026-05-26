import { FraudJourneyStage, PredictedAction, VictimStateLabel } from '@prisma/client';

/**
 * Stub implementations for the three Phase 6E AI insight engines (PDF §44
 * fraud-journey / victim-state / predicted-next-move). Honest about their
 * limits — they're keyword-driven heuristics over caller-supplied hints
 * rather than real models. Each pure function returns a deterministic verdict
 * with a model version so real Python services can swap in via the same
 * contract.
 */

export const STUB_JOURNEY_VERSION = 'fraud-journey-stub-1.0.0';
export const STUB_VICTIM_STATE_VERSION = 'victim-state-stub-1.0.0';
export const STUB_PREDICTED_MOVE_VERSION = 'predicted-move-stub-1.0.0';

export interface InsightHints {
  /** Optional transcript / interaction text the caller can supply. */
  transcript?: string;
  /** Optional reviewer notes. */
  notes?: string;
  /** Optional explicit hint to skip inference. */
  forceStage?: FraudJourneyStage;
  forceState?: VictimStateLabel;
}

export interface JourneyResult {
  stage: FraudJourneyStage;
  confidence: number;
  modelVersion: string;
  evidence: { matchedKeywords: string[] };
}

export interface VictimStateResult {
  state: VictimStateLabel;
  confidence: number;
  modelVersion: string;
  signals: { matchedKeywords: string[] };
}

export interface PredictedMoveResult {
  action: PredictedAction;
  confidence: number;
  modelVersion: string;
  rationale: string;
}

// ─── Fraud Journey ───

const JOURNEY_RULES: Array<{ stage: FraudJourneyStage; pattern: RegExp; keyword: string }> = [
  { stage: 'PAYMENT_REQUEST', pattern: /\b(payment|transfer|wire|gift\s*card|send\s+money)\b/i, keyword: 'payment-request' },
  { stage: 'URGENCY_INJECTION', pattern: /\b(urgent|right\s+now|immediately|expires\s+today)\b/i, keyword: 'urgency' },
  { stage: 'INFORMATION_GATHERING', pattern: /\b(social\s+security|ssn|password|account\s+number|date\s+of\s+birth)\b/i, keyword: 'info-gathering' },
  { stage: 'TRUST_BUILDING', pattern: /\b(trust\s+me|i'?ll\s+help|i\s+understand|my\s+friend)\b/i, keyword: 'trust-building' },
];

export function stubAssessJourney(hints: InsightHints = {}): JourneyResult {
  if (hints.forceStage) {
    return { stage: hints.forceStage, confidence: 80, modelVersion: STUB_JOURNEY_VERSION, evidence: { matchedKeywords: ['forced'] } };
  }
  const text = `${hints.transcript ?? ''} ${hints.notes ?? ''}`;
  const matched: string[] = [];
  let chosen: FraudJourneyStage = 'INITIAL_CONTACT';
  for (const rule of JOURNEY_RULES) {
    if (rule.pattern.test(text)) {
      matched.push(rule.keyword);
      // First rule (most progressed stage) wins.
      if (chosen === 'INITIAL_CONTACT') chosen = rule.stage;
    }
  }
  const confidence = matched.length === 0 ? 35 : Math.min(70, 35 + matched.length * 12);
  return { stage: chosen, confidence, modelVersion: STUB_JOURNEY_VERSION, evidence: { matchedKeywords: matched } };
}

// ─── Victim State ───

const VICTIM_RULES: Array<{ state: VictimStateLabel; pattern: RegExp; keyword: string }> = [
  { state: 'COMPROMISED', pattern: /\b(ok(ay)?\s+i'?ll\s+do\s+it|alright\s+(then|fine)|i'?ll\s+send\s+it)\b/i, keyword: 'compliance' },
  { state: 'ALARMED', pattern: /\b(scared|afraid|threatened|panic|terrified)\b/i, keyword: 'fear' },
  { state: 'PRESSURED', pattern: /\b(let\s+me\s+(think|check)|wait|but\s+i'?m\s+not\s+sure)\b/i, keyword: 'hesitation' },
  { state: 'CONFUSED', pattern: /\b(confused|don'?t\s+understand|what\s+do\s+you\s+mean|why)\b/i, keyword: 'confusion' },
  { state: 'TRUSTING', pattern: /\b(thank\s+you|that\s+makes\s+sense|i\s+believe\s+you)\b/i, keyword: 'trust' },
];

export function stubAssessVictimState(hints: InsightHints = {}): VictimStateResult {
  if (hints.forceState) {
    return { state: hints.forceState, confidence: 80, modelVersion: STUB_VICTIM_STATE_VERSION, signals: { matchedKeywords: ['forced'] } };
  }
  const text = `${hints.transcript ?? ''} ${hints.notes ?? ''}`;
  const matched: string[] = [];
  let chosen: VictimStateLabel = 'CALM';
  for (const rule of VICTIM_RULES) {
    if (rule.pattern.test(text)) {
      matched.push(rule.keyword);
      if (chosen === 'CALM') chosen = rule.state;
    }
  }
  const confidence = matched.length === 0 ? 40 : Math.min(70, 40 + matched.length * 10);
  return { state: chosen, confidence, modelVersion: STUB_VICTIM_STATE_VERSION, signals: { matchedKeywords: matched } };
}

// ─── Predicted Next Move (state-machine over journey stage) ───

const NEXT_MOVE_MAP: Record<FraudJourneyStage, PredictedAction> = {
  INITIAL_CONTACT: 'REQUEST_PERSONAL_INFO',
  TRUST_BUILDING: 'REQUEST_PERSONAL_INFO',
  INFORMATION_GATHERING: 'ESCALATE_URGENCY',
  URGENCY_INJECTION: 'REQUEST_PAYMENT',
  PAYMENT_REQUEST: 'REQUEST_GIFT_CARD',
  COMPLETED: 'DROP_OFF',
  INTERVENED: 'DROP_OFF',
};

export function stubPredictNextMove(currentStage: FraudJourneyStage): PredictedMoveResult {
  const action = NEXT_MOVE_MAP[currentStage];
  return {
    action,
    confidence: action === 'DROP_OFF' ? 40 : 55,
    modelVersion: STUB_PREDICTED_MOVE_VERSION,
    rationale: `Stage ${currentStage} typically progresses to ${action}`,
  };
}
