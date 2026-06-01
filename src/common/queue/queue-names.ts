/**
 * Canonical queue names and per-queue payload types.
 *
 * The QueueService enqueue method is typed against this union, so a typo
 * in a queue name or payload shape is a compile error at the call site.
 * Adding a new queue: extend `QueueName`, add a payload type, append to
 * `QueuePayloads`. Real per-queue processors are owned by the consuming
 * module (notifications, walletguard, claimverify, etc.) — this file only
 * defines the contract.
 */

export const QUEUE_NAMES = {
  /** Background risk-fusion + unified-score recomputation. */
  RiskProcessing: 'risk-processing',
  /** WalletGuard address/network/clipboard-swap checks. */
  WalletChecks: 'wallet-checks',
  /** ClaimVerify subject lookups + scoring. */
  ClaimVerification: 'claim-verification',
  /** OSINT enrichment passes for newly verified indicators. */
  OsintEnrichment: 'osint-enrichment',
  /** Evidence Vault bundle export (zip + signed URL). */
  EvidenceExport: 'evidence-export',
  /** Outbound notification delivery (email/SMS/push) + retry. */
  NotificationDelivery: 'notification-delivery',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

// ─── Per-queue payload contracts ────────────────────────────────────────────
//
// Kept loose for now (Phase 8B is the substrate); each Phase 9 module
// tightens its own payload shape when it ships its processor.

export interface RiskProcessingPayload {
  userId: string;
  tenantId: string | null;
  reason: string;
  metadata?: Record<string, unknown>;
}

export interface WalletCheckPayload {
  userId: string;
  tenantId: string | null;
  address: string;
  network: string;
  clipboardSwap?: boolean;
}

export interface ClaimVerificationPayload {
  userId: string;
  tenantId: string | null;
  claimType: string;
  subject: Record<string, unknown>;
}

export interface OsintEnrichmentPayload {
  signalId: string;
  indicatorType: string;
  normalizedIndicator: string;
}

export interface EvidenceExportPayload {
  evidenceEventId: string;
  tenantId: string;
  requestedByUserId: string;
}

export interface NotificationDeliveryPayload {
  tenantId: string | null;
  channel: 'email' | 'sms' | 'push' | 'in-app' | 'websocket';
  recipient: string;
  templateKey: string;
  variables?: Record<string, unknown>;
}

/** Discriminated by queue name → typed payload. */
export type QueuePayloads = {
  [QUEUE_NAMES.RiskProcessing]: RiskProcessingPayload;
  [QUEUE_NAMES.WalletChecks]: WalletCheckPayload;
  [QUEUE_NAMES.ClaimVerification]: ClaimVerificationPayload;
  [QUEUE_NAMES.OsintEnrichment]: OsintEnrichmentPayload;
  [QUEUE_NAMES.EvidenceExport]: EvidenceExportPayload;
  [QUEUE_NAMES.NotificationDelivery]: NotificationDeliveryPayload;
};
