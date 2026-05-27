import { IndicatorType } from '@prisma/client';

/**
 * Contract for the safe OSINT enrichment service (PDF §44 osint, docs/02
 * Phase 6 "safe OSINT enrichment"). The external Python service is expected
 * to expose POST `/osint/<indicatorType>` returning the response shape below.
 * "Safe" means public-source data only — never PII.
 */

export interface OsintEnrichmentInput {
  indicatorType: IndicatorType;
  normalizedIndicator: string;
}

export interface OsintEnrichmentOutput {
  provider: string;
  modelVersion: string;
  data: Record<string, unknown>;
  /** Short risk hints derived from the OSINT data (e.g. "recently-registered"). */
  riskHints: string[];
}
