import { createHash } from 'crypto';

/**
 * Deterministic JSON serialization — object keys sorted recursively — so a
 * value hashes identically regardless of property order (e.g. after a
 * round-trip through JSONB storage, which does not preserve key order).
 */
export function stableStringify(value: unknown): string {
  if (value === null || value === undefined) {
    return 'null';
  }
  if (typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

/** The content of one evidence event, in the exact shape that gets hashed. */
export interface HashableEvent {
  sequence: number;
  tenantId: string | null;
  actorId: string | null;
  actorType: string | null;
  entityType: string;
  entityId: string;
  eventType: string;
  eventDescription: string;
  metadata: unknown;
  ipAddress: string | null;
  deviceId: string | null;
  occurredAt: Date;
  previousHash: string | null;
}

/**
 * SHA-256 over the canonical event content plus the previous chain link.
 * Altering any field — or re-linking the event — changes the hash, which is
 * what makes the chain tamper-evident.
 */
export function computeEventHash(event: HashableEvent): string {
  const canonical = stableStringify({
    sequence: event.sequence,
    tenantId: event.tenantId,
    actorId: event.actorId,
    actorType: event.actorType,
    entityType: event.entityType,
    entityId: event.entityId,
    eventType: event.eventType,
    eventDescription: event.eventDescription,
    metadata: event.metadata ?? null,
    ipAddress: event.ipAddress,
    deviceId: event.deviceId,
    occurredAt: event.occurredAt.toISOString(),
    previousHash: event.previousHash,
  });
  return createHash('sha256').update(canonical).digest('hex');
}
