/**
 * Canonical real-time event channels and their payload contracts.
 *
 * Same role as `queue-names.ts` for BullMQ — a single source of truth
 * means the gateway, the EventsService, and the consuming modules all
 * agree on the wire shape. Adding a channel: extend EventChannel, add a
 * payload type, append to EventPayloads.
 */

export const EVENT_CHANNELS = {
  /** Generic risk-level change → frontend alert popup. */
  RiskAlert: 'risk.alert',
  /** Guardian Pause countdown ticks + state changes. */
  GuardianPauseCountdown: 'guardian-pause.countdown',
  /** A trusted contact has a new review request to act on. */
  TrustedContactReviewRequest: 'trusted-contact.review-request',
  /** FreezeLock has fired — show the intervention UI. */
  FreezeLockTriggered: 'freezelock.triggered',
} as const;

export type EventChannel = (typeof EVENT_CHANNELS)[keyof typeof EVENT_CHANNELS];

export interface RiskAlertPayload {
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  reason: string;
  evidenceEventId?: string;
}

export interface GuardianPauseCountdownPayload {
  pauseEventId: string;
  status: 'STARTED' | 'TICK' | 'EXPIRED' | 'RESOLVED';
  remainingSeconds: number;
}

export interface TrustedContactReviewRequestPayload {
  reviewId: string;
  triggerModule: 'GUARDIAN_PAUSE' | 'SCAMHOLD' | 'GIFTCARDGUARD' | 'WALLETGUARD' | 'CLAIMVERIFY';
  userId: string;
  requestedAt: string;
}

export interface FreezeLockTriggeredPayload {
  freezeLockEventId: string;
  trigger: string;
  actions: string[];
}

export type EventPayloads = {
  [EVENT_CHANNELS.RiskAlert]: RiskAlertPayload;
  [EVENT_CHANNELS.GuardianPauseCountdown]: GuardianPauseCountdownPayload;
  [EVENT_CHANNELS.TrustedContactReviewRequest]: TrustedContactReviewRequestPayload;
  [EVENT_CHANNELS.FreezeLockTriggered]: FreezeLockTriggeredPayload;
};

/** Helper — build the tenant-scoped room name. */
export function tenantRoom(tenantId: string): string {
  return `tenant:${tenantId}`;
}

/** Helper — build the user-scoped room name (used for per-user notifications). */
export function userRoom(userId: string): string {
  return `user:${userId}`;
}
