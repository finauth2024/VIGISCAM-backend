import { Prisma } from '@prisma/client';

/** Input for appending one event to the evidence chain. */
export interface AppendEvidenceInput {
  tenantId?: string | null;
  actorId?: string | null;
  actorType?: string | null;
  entityType: string;
  entityId: string;
  eventType: string;
  eventDescription: string;
  metadata?: Prisma.InputJsonValue;
  ipAddress?: string | null;
  deviceId?: string | null;
}

/** Result of verifying a tenant's evidence chain. */
export interface ChainVerification {
  intact: boolean;
  totalEvents: number;
  brokenAtSequence?: number;
  reason?: string;
}

/** Well-known evidence entity types (extended as later phases emit more). */
export const EvidenceEntity = {
  SESSION: 'SESSION',
  DEVICE: 'DEVICE',
} as const;

/** Well-known evidence event types. */
export const EvidenceEventType = {
  SESSION_STARTED: 'SESSION_STARTED',
  SESSION_ENDED: 'SESSION_ENDED',
} as const;
