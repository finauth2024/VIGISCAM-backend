import { IndicatorType } from '@prisma/client';
import { OsintEnrichmentInput, OsintEnrichmentOutput } from './osint.types';

/**
 * Deterministic in-process OSINT stub. Public-only mock data — no PII.
 * The output shape mirrors what a real provider would return so the rest of
 * the pipeline (persistence, risk hints, dashboards) stays unchanged when the
 * external service swaps in via AI_SERVICE_URL.
 */

export const STUB_OSINT_PROVIDER = 'osint-stub';
export const STUB_OSINT_VERSION = 'osint-stub-1.0.0';

/** FNV-1a — same deterministic hash used by the embedding stub. */
function fnv1a(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

const REGISTRARS = ['Namecheap', 'GoDaddy', 'Cloudflare', 'Tucows', 'Porkbun', 'Gandi'];
const CARRIERS = ['mobile', 'landline', 'voip', 'unknown'];

export function stubOsintEnrich(input: OsintEnrichmentInput): OsintEnrichmentOutput {
  const seed = fnv1a(`${input.indicatorType}:${input.normalizedIndicator}`);
  const data = buildData(input.indicatorType, input.normalizedIndicator, seed);
  return {
    provider: STUB_OSINT_PROVIDER,
    modelVersion: STUB_OSINT_VERSION,
    data,
    riskHints: data.riskHints as string[],
  };
}

function buildData(
  type: IndicatorType,
  indicator: string,
  seed: number,
): Record<string, unknown> {
  switch (type) {
    case 'DOMAIN':
    case 'URL': {
      const domainAgeDays = seed % 720; // 0–~2 years
      const registrar = REGISTRARS[seed % REGISTRARS.length];
      const sslValid = seed % 7 !== 0;
      const riskHints: string[] = [];
      if (domainAgeDays < 30) riskHints.push('recently-registered');
      if (!sslValid) riskHints.push('ssl-invalid');
      return { indicator, domainAgeDays, registrar, sslValid, riskHints };
    }
    case 'EMAIL': {
      const at = indicator.indexOf('@');
      const domain = at >= 0 ? indicator.slice(at + 1) : indicator;
      const domainAgeDays = seed % 1200;
      const reputationScore = 50 + (seed % 50); // 50-99
      const breachHitCount = seed % 5;
      const riskHints: string[] = [];
      if (domainAgeDays < 60) riskHints.push('young-email-domain');
      if (breachHitCount > 0) riskHints.push(`breach-hits-${breachHitCount}`);
      return { domain, domainAgeDays, reputationScore, breachHitCount, riskHints };
    }
    case 'PHONE': {
      const country = indicator.startsWith('+1')
        ? 'US'
        : indicator.startsWith('+44')
          ? 'GB'
          : 'UNKNOWN';
      const carrierType = CARRIERS[seed % CARRIERS.length];
      const riskHints: string[] = [];
      if (carrierType === 'voip') riskHints.push('voip-number');
      return { country, carrierType, riskHints };
    }
    case 'CRYPTO_WALLET': {
      const chain = /^0x/i.test(indicator) ? 'EVM' : indicator.startsWith('bc1') ? 'BTC' : 'UNKNOWN';
      const balanceBucket = ['empty', 'micro', 'small', 'medium', 'large'][seed % 5];
      const knownScamListHit = seed % 6 === 0;
      const riskHints: string[] = [];
      if (knownScamListHit) riskHints.push('known-scam-list-hit');
      return { chain, balanceBucket, knownScamListHit, riskHints };
    }
    default:
      return { indicator, riskHints: [] as string[] };
  }
}
