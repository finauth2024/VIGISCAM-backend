import { BadRequestException } from '@nestjs/common';

/**
 * Safe-language enforcement (PDF §38 non-negotiables #7/#8, docs/04 §2).
 *
 * VIGISCAM publishes statements about real people and businesses. Public
 * surfaces must use status-based, non-accusatory language — never a direct,
 * unqualified accusation of a named entity. This is enforced as backend
 * behaviour, not policy text: reviewer-authored public text is scanned before
 * it can ever be stored on a publishable registry entry.
 *
 * Behaviour-based descriptions ("impersonates a bank", "associated with a
 * crypto fraud campaign", "high-risk indicator") are allowed — they describe
 * observed activity. Identity accusations ("is a scammer", "is a criminal")
 * are not.
 */
const FORBIDDEN_PATTERNS: { pattern: RegExp; label: string }[] = [
  {
    pattern: /\bis\s+(a\s+|an\s+)?(scammer|criminal|fraudster|thief|crook|con\s?artist|scam\s?artist|swindler)\b/i,
    label: 'a direct identity accusation (e.g. "is a scammer")',
  },
  {
    pattern: /\bis\s+criminal\b/i,
    label: 'a direct identity accusation (e.g. "is criminal")',
  },
  {
    pattern: /\bare\s+(scammers|criminals|fraudsters|thieves|crooks)\b/i,
    label: 'a direct identity accusation (e.g. "are scammers")',
  },
  {
    pattern: /\b(owned|run|operated)\s+by\s+(a\s+|an\s+)?(scammer|criminal|fraudster|crook)/i,
    label: 'a direct identity accusation (e.g. "owned by a scammer")',
  },
];

/**
 * Returns a description of the first unsafe phrase found, or null if the text
 * is public-safe.
 */
export function findUnsafeLanguage(text: string): string | null {
  for (const { pattern, label } of FORBIDDEN_PATTERNS) {
    if (pattern.test(text)) {
      return label;
    }
  }
  return null;
}

/**
 * Throws if `text` contains a forbidden identity accusation. Call this on
 * every reviewer-authored field before it is stored on a registry entry.
 */
export function assertPublicSafeLanguage(text: string, fieldName: string): void {
  const violation = findUnsafeLanguage(text);
  if (violation) {
    throw new BadRequestException(
      `${fieldName} contains ${violation}. Public-safe entries must use ` +
        'status-based language describing observed behaviour, not direct ' +
        'accusations against a named person or business.',
    );
  }
}
