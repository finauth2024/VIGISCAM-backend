import { WalletNetwork } from '@prisma/client';

/**
 * Per-network address format validators (Phase 9D).
 *
 * These are *format* checks, not on-chain existence checks — they
 * catch typos, paste errors and obvious garbage. A real "this address
 * exists / has been used" lookup happens out-of-band against the
 * Identity Collision Graph (9G) and per-network indexers; the result
 * comes back via `reputation` + `graphMatchScore` on the check call.
 *
 * The brief calls out clipboard-swap and wallet-switch detection,
 * which the caller flags on the DTO based on agent-side observations.
 * Those flags drive the score; the validator just gates format.
 */

const VALIDATORS: Record<WalletNetwork, (address: string) => boolean> = {
  // EVM family — 0x + 40 hex chars. We don't enforce checksum case here
  // since user-typed addresses arrive in all-lower / all-upper / mixed.
  ETH: (a) => /^0x[a-fA-F0-9]{40}$/.test(a),
  BSC: (a) => /^0x[a-fA-F0-9]{40}$/.test(a),
  MATIC: (a) => /^0x[a-fA-F0-9]{40}$/.test(a),
  ARBITRUM: (a) => /^0x[a-fA-F0-9]{40}$/.test(a),
  OPTIMISM: (a) => /^0x[a-fA-F0-9]{40}$/.test(a),

  // Bitcoin — accept legacy (1...), P2SH (3...), and bech32 (bc1...).
  // Lengths vary 26-62; the prefix narrows the format enough.
  BTC: (a) =>
    /^(1[a-km-zA-HJ-NP-Z1-9]{25,34}|3[a-km-zA-HJ-NP-Z1-9]{25,34}|bc1[a-z0-9]{23,87})$/.test(a),

  // Tron — base58, starts with 'T', 34 chars total.
  TRX: (a) => /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(a),

  // Solana — base58, 32-44 chars (no leading-prefix discriminator).
  SOL: (a) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(a),

  // OTHER — accept anything 8-128 printable. The caller has chosen to
  // bypass per-network validation; we just block empty/whitespace.
  OTHER: (a) => /^\S{8,128}$/.test(a),
};

/** True iff the address parses cleanly under the network's format. */
export function isAddressValid(network: WalletNetwork, address: string): boolean {
  return VALIDATORS[network](address.trim());
}
