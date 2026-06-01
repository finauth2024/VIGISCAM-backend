import { FraudGraphNodeType } from '@prisma/client';

/**
 * PII guardrail for Identity Collision Graph reads (Phase 9G).
 *
 * The graph holds raw values (full phone numbers, emails, face hashes,
 * etc.) because internal matching needs them. The /identity-graph/*
 * surface, however, MUST return only redacted values to its callers —
 * an investigator browsing a cluster shouldn't see victim PII verbatim.
 *
 * `mask(node)` returns the display string the API should show. When a
 * node has a stored `displayMask`, that's used directly (server-of-
 * record). Otherwise the masker derives a redaction from the node's
 * `normalizedIndicator` + `nodeType` so legacy rows still come out safe.
 */

export interface MaskableNode {
  nodeType: FraudGraphNodeType;
  normalizedIndicator: string | null;
  displayMask: string | null;
  label: string;
}

/** Node types whose raw value must NEVER be returned to API consumers. */
const SENSITIVE_TYPES = new Set<FraudGraphNodeType>(['PROFILE', 'FACE_SIGNAL', 'VOICE_SIGNAL']);

/** Indicator-backed node types that carry per-indicator-type masking. */
const INDICATOR_MASK_BY_TYPE = (value: string, nodeType: FraudGraphNodeType): string | null => {
  // The fraud-graph stores normalizedIndicator for INDICATOR nodes; the
  // discriminator lives on the IndicatorType the row was indexed under,
  // not the nodeType. We mask by shape — phone vs email vs wallet — by
  // looking at the value itself.
  if (nodeType !== 'INDICATOR') return null;

  // Email: name@host → `n***@host`
  if (/^[^@]+@[^@]+\.[^@]+$/.test(value)) {
    const [local, host] = value.split('@');
    const head = local.charAt(0);
    return `${head}${'*'.repeat(Math.max(2, local.length - 1))}@${host}`;
  }
  // Phone — E.164 or digits-only. Keep country code + last 4.
  if (/^\+?\d{7,15}$/.test(value)) {
    const digits = value.replace(/\D/g, '');
    const tail = digits.slice(-4);
    const head = value.startsWith('+') ? value.slice(0, 3) : '';
    return `${head}${head ? '-' : ''}***-***-${tail}`;
  }
  // Crypto wallet — keep first 6 + last 6.
  if (
    /^(0x[a-fA-F0-9]{40,}|[13][a-km-zA-HJ-NP-Z0-9]{25,}|bc1[a-z0-9]+|T[1-9A-HJ-NP-Za-km-z]+|[1-9A-HJ-NP-Za-km-z]{32,44})$/.test(
      value,
    )
  ) {
    if (value.length <= 14) return value;
    return `${value.slice(0, 6)}...${value.slice(-6)}`;
  }
  return null;
};

export function mask(node: MaskableNode): string {
  if (node.displayMask) return node.displayMask;

  const raw = node.normalizedIndicator;
  if (!raw) return node.label;

  // Sensitive nodes: never reveal the raw value. Show the first 8 chars
  // of an opaque token (face hash, voice fingerprint) or a handle stub.
  if (SENSITIVE_TYPES.has(node.nodeType)) {
    if (node.nodeType === 'PROFILE') {
      // @username → @u***me
      const stripped = raw.replace(/^@/, '');
      if (stripped.length <= 3) return `@${stripped.charAt(0)}***`;
      return `@${stripped.charAt(0)}${'*'.repeat(stripped.length - 3)}${stripped.slice(-2)}`;
    }
    // FACE_SIGNAL / VOICE_SIGNAL — opaque hash, first 8 chars.
    return `${raw.slice(0, 8)}…`;
  }

  // Indicator-backed nodes — mask by inferred shape.
  const byType = INDICATOR_MASK_BY_TYPE(raw, node.nodeType);
  if (byType) return byType;

  // Everything else (DOMAIN, URL, IP_RANGE, CAMPAIGN labels, …) is
  // public-safe by construction; show the label.
  return node.label;
}
