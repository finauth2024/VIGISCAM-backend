import { IndicatorType } from '@prisma/client';

export interface ExtractedIndicator {
  indicatorType: IndicatorType;
  indicatorValue: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[0-9][0-9 ()-]{6,}$/;
const DOMAIN_RE = /^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i;

function firstString(s: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = s[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return undefined;
}

/** "https://secure-login.example.com/path" -> "secure-login.example.com". */
function toDomain(raw: string): string {
  return raw
    .replace(/^[a-z]+:\/\//i, '')
    .replace(/[/?#].*$/, '')
    .trim()
    .toLowerCase();
}

/**
 * CP-5 — pull canonical scam indicators out of a free-form ClaimVerify subject
 * so the suspicious claim can feed ScamPulse signal intake. Only well-formed,
 * structured values are emitted (garbage never becomes a signal). Pure +
 * deduplicated; no PII beyond the indicator value itself.
 */
export function extractClaimIndicators(subject: unknown): ExtractedIndicator[] {
  const out: ExtractedIndicator[] = [];
  if (!subject || typeof subject !== 'object') return out;
  const s = subject as Record<string, unknown>;
  const seen = new Set<string>();
  const push = (indicatorType: IndicatorType, value?: string) => {
    if (!value) return;
    const key = `${indicatorType}:${value.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ indicatorType, indicatorValue: value });
  };

  const domainRaw = firstString(s, ['websiteDomain', 'domain', 'website', 'url']);
  if (domainRaw) {
    const d = toDomain(domainRaw);
    if (DOMAIN_RE.test(d)) push('DOMAIN', d);
  }
  const email = firstString(s, ['email', 'contactEmail']);
  if (email && EMAIL_RE.test(email)) push('EMAIL', email.toLowerCase());

  const phone = firstString(s, ['phone', 'phoneNumber', 'contactPhone']);
  if (phone && PHONE_RE.test(phone)) push('PHONE', phone.replace(/[\s()-]/g, ''));

  const wallet = firstString(s, ['wallet', 'walletAddress', 'cryptoWallet', 'address']);
  if (wallet && /^[a-zA-Z0-9]{20,}$/.test(wallet)) push('CRYPTO_WALLET', wallet);

  const name = firstString(s, ['personOrBusinessName', 'businessName', 'company', 'name']);
  if (name && name.length >= 2) push('FAKE_COMPANY', name);

  return out;
}
