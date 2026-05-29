import { ClusterMatchType, IndicatorType } from '@prisma/client';
import { normalizeDomain } from '../scam-signals/normalization';

/**
 * Clustering logic (PDF §32). MVP rule set: signals are auto-clustered when
 * they share a domain root (domains/URLs) or an email domain. Other indicator
 * types are not auto-clustered — they can be grouped manually by a reviewer.
 */

export interface DerivedClusterKey {
  /** Stable unique key — the find-or-create handle for the cluster. */
  key: string;
  matchType: ClusterMatchType;
  label: string;
}

/**
 * Reduce a hostname to its registrable root (the last two labels).
 * MVP heuristic: multi-part public suffixes (e.g. `.co.uk`) are not
 * special-cased; a public-suffix list can replace this later.
 */
export function domainRoot(host: string): string | null {
  const clean = host.trim().toLowerCase().replace(/\.+$/, '');
  if (!clean || /\s/.test(clean)) {
    return null;
  }
  const labels = clean.split('.').filter(Boolean);
  if (labels.length < 2) {
    return null;
  }
  return labels.slice(-2).join('.');
}

/** Extract the domain part of an email address. */
export function emailDomain(email: string): string | null {
  const at = email.lastIndexOf('@');
  if (at < 0) {
    return null;
  }
  const domain = email
    .slice(at + 1)
    .trim()
    .toLowerCase();
  return domain.includes('.') && !/\s/.test(domain) ? domain : null;
}

/**
 * Derive the cluster a signal belongs to. Returns null when the indicator type
 * is not auto-clustered in the MVP rule set.
 */
export function deriveClusterKey(
  indicatorType: IndicatorType,
  normalizedIndicator: string,
): DerivedClusterKey | null {
  switch (indicatorType) {
    case 'DOMAIN':
    case 'URL': {
      // normalizeDomain strips scheme/path/port, so it works for both a bare
      // domain and a full URL.
      const root = domainRoot(normalizeDomain(normalizedIndicator));
      return root
        ? {
            key: `domain-root:${root}`,
            matchType: 'SHARED_DOMAIN_ROOT',
            label: `Domain root — ${root}`,
          }
        : null;
    }
    case 'EMAIL': {
      const domain = emailDomain(normalizedIndicator);
      return domain
        ? {
            key: `email-domain:${domain}`,
            matchType: 'SHARED_EMAIL',
            label: `Email domain — ${domain}`,
          }
        : null;
    }
    default:
      return null;
  }
}
