/**
 * ScamMirror input sanitizer (Phase 9F).
 *
 * The simulation environment must NEVER store real credentials —
 * otherwise the training tool itself becomes a credential-leak vector.
 * This sanitizer scans user input for patterns that indicate real
 * secrets and returns a `reject` verdict the service uses to abort
 * the session.
 *
 * Patterns covered (high-confidence only — false positives here block
 * legitimate role-play):
 *   1. Credit card numbers — 13-19 digit sequences that pass the Luhn
 *      checksum. Embedded with optional spaces / dashes.
 *   2. Ethereum / EVM private keys — `0x` + 64 hex chars.
 *   3. Bitcoin WIF private keys — base58 51-52 chars starting 5 / K / L.
 *   4. BIP39 mnemonics — 12 or 24 consecutive lowercase words separated
 *      by single spaces (loose heuristic; tighter check requires the
 *      BIP39 wordlist which we'd rather not embed for security).
 *   5. US SSN — XXX-XX-XXXX or 9 contiguous digits (only flagged when
 *      preceded by "SSN", "social", or "ssn:" — full 9-digit numbers
 *      are too common in unrelated contexts).
 *
 * Returns a discriminated result so the caller can log which pattern
 * fired without exposing the matched substring.
 */

export type SanitizerVerdict = { ok: true } | { ok: false; reason: SanitizerReason };

export type SanitizerReason =
  | 'CREDIT_CARD'
  | 'ETH_PRIVATE_KEY'
  | 'BITCOIN_WIF'
  | 'MNEMONIC_PHRASE'
  | 'SSN';

export function sanitize(input: string): SanitizerVerdict {
  if (hasCreditCard(input)) return { ok: false, reason: 'CREDIT_CARD' };
  if (hasEthPrivateKey(input)) return { ok: false, reason: 'ETH_PRIVATE_KEY' };
  if (hasBitcoinWif(input)) return { ok: false, reason: 'BITCOIN_WIF' };
  if (hasMnemonic(input)) return { ok: false, reason: 'MNEMONIC_PHRASE' };
  if (hasSsn(input)) return { ok: false, reason: 'SSN' };
  return { ok: true };
}

// ── 1. Credit cards ─────────────────────────────────────────────────────────

function hasCreditCard(input: string): boolean {
  // Find any 13-19 digit run with optional spaces / dashes between.
  const matches = input.match(/\b(?:\d[ -]*?){13,19}\b/g);
  if (!matches) return false;
  for (const raw of matches) {
    const digits = raw.replace(/[^0-9]/g, '');
    if (digits.length < 13 || digits.length > 19) continue;
    if (luhnValid(digits)) return true;
  }
  return false;
}

function luhnValid(digits: string): boolean {
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = digits.charCodeAt(i) - 48;
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

// ── 2 & 3. Crypto private keys ──────────────────────────────────────────────

function hasEthPrivateKey(input: string): boolean {
  // 0x + 64 hex chars. We don't try to distinguish private keys from
  // 32-byte hashes — both are sensitive enough to refuse.
  return /\b0x[a-fA-F0-9]{64}\b/.test(input);
}

function hasBitcoinWif(input: string): boolean {
  // WIF private keys: 51-52 base58 chars, prefix 5 (uncompressed),
  // K or L (compressed).
  return /\b[5KL][1-9A-HJ-NP-Za-km-z]{50,51}\b/.test(input);
}

// ── 4. BIP39 mnemonics ──────────────────────────────────────────────────────

function hasMnemonic(input: string): boolean {
  // 12+ lowercase 3-8-letter words separated by single spaces, on a
  // line by themselves. Real BIP39 recovery phrases arrive standalone;
  // normal prose may contain many consecutive short lowercase words
  // (e.g. "send money quickly because the project starts tomorrow…")
  // but never as an entire line in isolation.
  const lines = input.split(/\r?\n/);
  return lines.some((line) => /^(?:[a-z]{3,8} ){11,}[a-z]{3,8}$/.test(line.trim()));
}

// ── 5. SSN ──────────────────────────────────────────────────────────────────

function hasSsn(input: string): boolean {
  // Only flag when explicitly labelled — bare 9-digit runs collide with
  // phone numbers / dates / order numbers in legitimate role-play.
  if (/\b\d{3}-\d{2}-\d{4}\b/.test(input)) return true;
  const labelled = /\b(?:ssn|social\s*security)\W{0,4}\d{3}\W?\d{2}\W?\d{4}\b/i;
  return labelled.test(input);
}
