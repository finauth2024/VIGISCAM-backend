/**
 * Phase 10C — grooming-detection deterministic scorer.
 *
 * **Critical design constraint:** this scorer never touches actual
 * message content. Inputs are signal flags only — the platform's
 * upstream pipeline (NLP classifier, age verification, behavior
 * analytics) is responsible for deriving these flags. We score the
 * pattern, not the words.
 *
 * Three reasons for the boundary:
 *   1. Conversation content involving suspected minors is a category
 *      of PII we never want to hold.
 *   2. Different platforms have different content models — flags
 *      generalize where text does not.
 *   3. The Phase 11B real-model swap can replace either the upstream
 *      flag-derivation OR this scorer independently.
 *
 * Hard stop: when `minorSuspected === true` AND any of
 * {payment-request, photo-solicitation, move-to-private-channel,
 * pii-escalation} is true → CRITICAL + ESCALATE_TO_LAW_ENFORCEMENT.
 * No score combination can override this — child safety is not a
 * threshold-tuning concern.
 */

export type GroomingAgeGapSignal =
  | 'UNKNOWN'
  | 'AGES_BOTH_VERIFIED_ADULT'
  | 'AGE_GAP_SMALL'
  | 'AGE_GAP_MODERATE'
  | 'AGE_GAP_LARGE'
  | 'ADULT_TO_SUSPECTED_MINOR';

export type GroomingRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type GroomingRecommendedAction =
  | 'NONE'
  | 'MONITOR'
  | 'SOFT_INTERVENE'
  | 'HARD_INTERVENE'
  | 'SUSPEND_USER'
  | 'ESCALATE_TO_TRUST_AND_SAFETY'
  | 'ESCALATE_TO_LAW_ENFORCEMENT';

export interface GroomingCheckInput {
  ageGapSignal: GroomingAgeGapSignal;
  relationshipDurationDays?: number;
  loveBombingDetected?: boolean;
  isolationLanguageDetected?: boolean;
  paymentRequestDetected?: boolean;
  photoSolicitationDetected?: boolean;
  moveToPrivateChannelDetected?: boolean;
  piiEscalationDetected?: boolean;
  minorSuspected?: boolean;
}

export interface GroomingCheckScoring {
  riskScore: number;
  riskLevel: GroomingRiskLevel;
  recommendedAction: GroomingRecommendedAction;
  breakdown: Array<{ key: string; points: number; reason: string }>;
}

const AGE_GAP_POINTS: Record<GroomingAgeGapSignal, number> = {
  UNKNOWN: 5,
  AGES_BOTH_VERIFIED_ADULT: 0,
  AGE_GAP_SMALL: 0,
  AGE_GAP_MODERATE: 10,
  AGE_GAP_LARGE: 20,
  ADULT_TO_SUSPECTED_MINOR: 40,
};

function relationshipDurationPoints(days: number | undefined): number {
  if (days === undefined || days < 0) return 0;
  // Compressed timelines correlate with love-bombing and grooming
  // playbooks (the "manufactured intimacy" pattern in the dataset).
  if (days <= 3) return 15;
  if (days <= 14) return 10;
  if (days <= 60) return 5;
  return 0;
}

export function scoreGroomingCheck(input: GroomingCheckInput): GroomingCheckScoring {
  const breakdown: GroomingCheckScoring['breakdown'] = [];

  const agePts = AGE_GAP_POINTS[input.ageGapSignal] ?? 0;
  if (agePts > 0) {
    breakdown.push({
      key: 'age_gap',
      points: agePts,
      reason: `Age-gap signal "${input.ageGapSignal}"`,
    });
  }

  const durPts = relationshipDurationPoints(input.relationshipDurationDays);
  if (durPts > 0) {
    breakdown.push({
      key: 'relationship_duration',
      points: durPts,
      reason: `Short relationship duration (${input.relationshipDurationDays} day(s)) — compressed-timeline pattern`,
    });
  }

  const signalContribs: Array<[keyof GroomingCheckInput, number, string]> = [
    ['loveBombingDetected', 15, 'Love-bombing language pattern detected'],
    ['isolationLanguageDetected', 20, '"Keep this between us" / isolation language detected'],
    ['paymentRequestDetected', 25, 'Payment request inside an intimate context'],
    ['photoSolicitationDetected', 25, 'Explicit-photo solicitation pattern detected'],
    ['moveToPrivateChannelDetected', 15, 'Push to move conversation off-platform'],
    ['piiEscalationDetected', 15, 'Requests for school / address / full name'],
  ];

  for (const [flag, pts, reason] of signalContribs) {
    if (input[flag]) {
      breakdown.push({ key: flag, points: pts, reason });
    }
  }

  if (input.minorSuspected) {
    breakdown.push({
      key: 'minor_suspected',
      points: 35,
      reason: 'Upstream classifier flagged the subject as a suspected minor',
    });
  }

  const raw = breakdown.reduce((acc, b) => acc + b.points, 0);
  const riskScore = Math.min(100, raw);

  // Hard-stop rules for child safety.
  const minorWithEscalation =
    input.minorSuspected === true &&
    Boolean(
      input.paymentRequestDetected ||
        input.photoSolicitationDetected ||
        input.moveToPrivateChannelDetected ||
        input.piiEscalationDetected,
    );
  const adultToSuspectedMinor = input.ageGapSignal === 'ADULT_TO_SUSPECTED_MINOR';

  let riskLevel: GroomingRiskLevel;
  let recommendedAction: GroomingRecommendedAction;

  if (minorWithEscalation) {
    riskLevel = 'CRITICAL';
    recommendedAction = 'ESCALATE_TO_LAW_ENFORCEMENT';
  } else if (adultToSuspectedMinor) {
    riskLevel = 'CRITICAL';
    recommendedAction = 'ESCALATE_TO_TRUST_AND_SAFETY';
  } else if (riskScore >= 80) {
    riskLevel = 'CRITICAL';
    recommendedAction = 'SUSPEND_USER';
  } else if (riskScore >= 60) {
    riskLevel = 'HIGH';
    recommendedAction = 'HARD_INTERVENE';
  } else if (riskScore >= 30) {
    riskLevel = 'MEDIUM';
    recommendedAction = 'SOFT_INTERVENE';
  } else if (riskScore >= 10) {
    riskLevel = 'LOW';
    recommendedAction = 'MONITOR';
  } else {
    riskLevel = 'LOW';
    recommendedAction = 'NONE';
  }

  return { riskScore, riskLevel, recommendedAction, breakdown };
}
