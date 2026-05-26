import { AuthenticityCheckType, AuthenticityResult } from '@prisma/client';

/**
 * Contract for the Authenticity Verification Suite (PDF §51). The external
 * Python service is expected to expose POST `/authenticity/<checkType>` with
 * the request body below and return the response shape. An in-process stub
 * satisfies the same contract for dev / CI use.
 */

export interface AuthenticityRequest {
  checkType: AuthenticityCheckType;
  sessionId: string;
  /**
   * Free-form check-specific payload (image / audio reference, frame hash,
   * device fingerprint, etc.). Stored on the verdict for traceability.
   */
  payload?: Record<string, unknown>;
}

export interface AuthenticityResponse {
  result: AuthenticityResult;
  /** 0–100 confidence in the verdict. */
  score: number;
  modelVersion: string;
  metadata?: Record<string, unknown>;
}
