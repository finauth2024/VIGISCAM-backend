import { AuthenticityRequest, AuthenticityResponse } from './authenticity.types';

/**
 * Stub authenticity verdict. Honest about its limits — it does not analyse
 * media because no real model is wired up. It returns:
 *   - FAIL/30 if the caller's payload explicitly flags a suspicion
 *     (suspectedDeepfake / suspectedSynthetic / suspectedSpoof = true).
 *   - INCONCLUSIVE/50 if no payload was provided at all.
 *   - PASS/70 otherwise — a cautious affirmative, deliberately below 100 so
 *     a stub verdict never looks like a real model's high-confidence pass.
 */

export const STUB_AUTHENTICITY_VERSION = 'authenticity-stub-1.0.0';

const SUSPICION_KEYS = ['suspectedDeepfake', 'suspectedSynthetic', 'suspectedSpoof'];

export function stubAuthenticityCheck(req: AuthenticityRequest): AuthenticityResponse {
  const payload = req.payload ?? null;
  if (!payload) {
    return {
      result: 'INCONCLUSIVE',
      score: 50,
      modelVersion: STUB_AUTHENTICITY_VERSION,
      metadata: { stub: true, reason: 'no-payload' },
    };
  }
  const suspicious = SUSPICION_KEYS.some((k) => payload[k] === true);
  if (suspicious) {
    return {
      result: 'FAIL',
      score: 30,
      modelVersion: STUB_AUTHENTICITY_VERSION,
      metadata: { stub: true, suspicionFlagged: true },
    };
  }
  return {
    result: 'PASS',
    score: 70,
    modelVersion: STUB_AUTHENTICITY_VERSION,
    metadata: { stub: true },
  };
}
