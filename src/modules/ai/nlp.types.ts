/**
 * Contract for the NLP scam-classification service (PDF §45 ClassificationService,
 * §29 ScamPulse AI). The Python service is expected to expose an HTTP endpoint
 * matching this shape; an in-process stub (see nlp-stub.ts) implements the
 * same contract for dev and CI use when no external service is configured.
 */

export interface NlpClassificationInput {
  text: string;
  /** Optional context the caller already has — improves stub accuracy. */
  indicatorType?: string;
  hintedCategory?: string | null;
}

export interface NlpClassificationOutput {
  /** Best-guess scam category code (e.g. BANK_IMPERSONATION). */
  category: string | null;
  /** 0–100 confidence in that category assignment. */
  categoryConfidence: number;
  /** 0–100 overall scam likelihood for the input text. */
  scamScore: number;
  /** Detected manipulation tactics (e.g. urgency, secrecy, fake-authority). */
  manipulationTactics: string[];
  /** Implementation tag — never trust input text, always trust this. */
  modelVersion: string;
}
