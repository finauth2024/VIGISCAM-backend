import { IndicatorType } from '@prisma/client';

/**
 * Indicator normalization (PDF §30). Normalizing before storage/lookup is what
 * makes deduplication and registry matching reliable.
 */

/** Phone -> E.164-ish: digits only, with a country prefix. */
export function normalizePhone(raw: string): string {
  const trimmed = raw.trim();
  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  if (hasPlus) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`; // assume North America
  return `+${digits}`;
}

/** Domain: strip scheme/path/port/userinfo, lowercase, drop a leading "www.". */
export function normalizeDomain(raw: string): string {
  let v = raw.trim().toLowerCase();
  v = v.replace(/^[a-z][a-z0-9+.-]*:\/\//, '');
  v = v.split('/')[0].split('?')[0].split('#')[0];
  v = v.split('@').pop() ?? v;
  v = v.split(':')[0];
  v = v.replace(/^www\./, '');
  return v.replace(/\.$/, '');
}

/** URL: lowercase, trim trailing slashes. */
export function normalizeUrl(raw: string): string {
  return raw.trim().toLowerCase().replace(/\/+$/, '');
}

/** Email: lowercase + trim. */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/** Crypto wallet: trim; lowercase EVM (0x…) addresses, leave others as-is. */
export function normalizeWallet(raw: string): string {
  const v = raw.trim();
  return /^0x/i.test(v) ? v.toLowerCase() : v;
}

/** Phrase: lowercase, trim, collapse internal whitespace. */
export function normalizePhrase(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Dispatch normalization by indicator type. */
export function normalizeIndicator(type: IndicatorType, value: string): string {
  switch (type) {
    case 'PHONE':
      return normalizePhone(value);
    case 'DOMAIN':
      return normalizeDomain(value);
    case 'URL':
      return normalizeUrl(value);
    case 'EMAIL':
      return normalizeEmail(value);
    case 'CRYPTO_WALLET':
      return normalizeWallet(value);
    case 'SCAM_PHRASE':
      return normalizePhrase(value);
    default:
      return value.trim().toLowerCase();
  }
}
