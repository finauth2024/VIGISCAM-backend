import { IndicatorType } from '@prisma/client';

/**
 * CP-6 — the OSINT provider-interface layer (reviewer #7, brief §32). Each
 * provider enriches a single indicator from a public source. The platform ships
 * with safe, structural stub providers; real integrations (WHOIS, passive DNS,
 * reputation feeds, blockchain explorers, …) drop in behind the same interface
 * via env-configured API keys with zero caller changes.
 *
 * PRIVACY BY CONSTRUCTION: a provider only ever receives the indicator type +
 * normalized indicator value. No victim PII, report text, or user identity is
 * ever passed to an external provider.
 */
export interface OsintProviderInput {
  indicatorType: IndicatorType;
  normalizedIndicator: string;
}

export interface ProviderLookupResult {
  /** Public-source data (never PII). */
  data: Record<string, unknown>;
  /** Short machine-readable risk hints, e.g. "recently-registered-domain". */
  riskHints: string[];
}

export type OsintProviderCategory =
  | 'WHOIS'
  | 'PASSIVE_DNS'
  | 'CERT_TRANSPARENCY'
  | 'DOMAIN_REPUTATION'
  | 'URL_REPUTATION'
  | 'PHONE_REPUTATION'
  | 'EMAIL_REPUTATION'
  | 'WALLET_REPUTATION'
  | 'BLOCKCHAIN_EXPLORER'
  | 'TAKEDOWN_HISTORY'
  | 'PUBLIC_ADVISORY';

export interface OsintProvider {
  /** Stable provider id, used as the OsintEnrichment.provider key. */
  readonly name: string;
  readonly category: OsintProviderCategory;
  /** Indicator types this provider can enrich. */
  supports(indicatorType: IndicatorType): boolean;
  /** True when a real integration is configured (API key present). */
  isLive(): boolean;
  /** Enrich the indicator. Must never throw — return empty on failure. */
  lookup(input: OsintProviderInput): Promise<ProviderLookupResult>;
}
