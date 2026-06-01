-- VIGISCAM Backend — Phase 9B: ScamHold AI™.
-- A scamhold event is created when the user attempts a high-risk financial
-- action (crypto / gift card / wire / bank / payment-app). The service
-- scores the attempt and either lets it through, blocks it, escalates to
-- a trusted contact, or pulls Guardian Pause (9A) on CRITICAL risk.

CREATE TYPE "ScamHoldTransactionType" AS ENUM (
  'CRYPTO',
  'GIFT_CARD',
  'WIRE_TRANSFER',
  'BANK_TRANSFER',
  'PAYMENT_APP',
  'ONLINE_PAYMENT'
);

CREATE TYPE "ScamHoldRiskLevel" AS ENUM (
  'LOW',
  'MEDIUM',
  'HIGH',
  'CRITICAL'
);

CREATE TYPE "ScamHoldStatus" AS ENUM (
  'PENDING',
  'RELEASE_AFTER_VERIFICATION',
  'BLOCK',
  'SEND_TO_TRUSTED_CONTACT',
  'SAVE_ONLY',
  'CONTINUE_ANYWAY'
);

CREATE TABLE "scamhold_events" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tenantId" UUID,
    "transactionType" "ScamHoldTransactionType" NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "recipient" TEXT NOT NULL,
    "recipientRisk" TEXT NOT NULL DEFAULT 'UNKNOWN',
    -- Detection-side context that fed the score.
    "urgencyDetected" BOOLEAN NOT NULL DEFAULT false,
    "secrecyDetected" BOOLEAN NOT NULL DEFAULT false,
    "activeCommunication" BOOLEAN NOT NULL DEFAULT false,
    "priorWarningsCount" INTEGER NOT NULL DEFAULT 0,
    -- Outputs.
    "riskScore" INTEGER NOT NULL,
    "riskLevel" "ScamHoldRiskLevel" NOT NULL,
    "riskBreakdown" JSONB NOT NULL,
    "status" "ScamHoldStatus" NOT NULL DEFAULT 'PENDING',
    "decidedAt" TIMESTAMP(3),
    "decisionNotes" TEXT,
    -- Cross-module joins.
    "guardianPauseEventId" UUID,
    "evidenceEventId" UUID,
    -- Soft pointer; lands in 9H.
    "trustedContactReviewId" UUID,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scamhold_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "scamhold_events_userId_idx" ON "scamhold_events"("userId");
CREATE INDEX "scamhold_events_tenantId_idx" ON "scamhold_events"("tenantId");
CREATE INDEX "scamhold_events_status_idx" ON "scamhold_events"("status");
CREATE INDEX "scamhold_events_riskLevel_idx" ON "scamhold_events"("riskLevel");
CREATE INDEX "scamhold_events_userId_createdAt_idx" ON "scamhold_events"("userId", "createdAt");

ALTER TABLE "scamhold_events" ADD CONSTRAINT "scamhold_events_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "scamhold_events" ADD CONSTRAINT "scamhold_events_guardianPauseEventId_fkey"
  FOREIGN KEY ("guardianPauseEventId") REFERENCES "pause_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "scamhold_events" ADD CONSTRAINT "scamhold_events_evidenceEventId_fkey"
  FOREIGN KEY ("evidenceEventId") REFERENCES "evidence_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;
