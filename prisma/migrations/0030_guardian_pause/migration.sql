-- VIGISCAM Backend — Phase 9A: Guardian Pause™.
-- A pause event is created whenever the user attempts a risky action that
-- the system wants them to stop and reconsider. Lifecycle:
--   ACTIVE -> RESOLVED              (user acknowledged + stepped away)
--   ACTIVE -> CONTINUED_ANYWAY      (user pushed past the warning)
--   ACTIVE -> EXPIRED               (countdown ran out without resolution)
-- Repeated CONTINUED_ANYWAY decisions on the same indicator raise the risk
-- score on subsequent attempts — tracked via continueAnywayCount.

CREATE TYPE "GuardianPauseTriggerType" AS ENUM (
  'MEDIUM_RISK',
  'CONTINUE_ANYWAY',
  'GIFT_CARD_REVEAL',
  'CRYPTO_TRANSFER_RISK',
  'WALLET_SWITCH',
  'SUSPICIOUS_CLAIM',
  'SCAMHOLD_ACTIVE',
  'URGENCY',
  'SECRECY',
  'ROMANCE_PRESSURE',
  'FAKE_AUTHORITY_PRESSURE',
  'ELDER_MODE_FINANCIAL'
);

CREATE TYPE "GuardianPauseRiskLevel" AS ENUM (
  'LOW',
  'MEDIUM',
  'HIGH',
  'CRITICAL'
);

CREATE TYPE "GuardianPauseStatus" AS ENUM (
  'ACTIVE',
  'RESOLVED',
  'CONTINUED_ANYWAY',
  'EXPIRED'
);

CREATE TABLE "pause_events" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tenantId" UUID,
    "riskLevel" "GuardianPauseRiskLevel" NOT NULL,
    "triggerType" "GuardianPauseTriggerType" NOT NULL,
    "triggerSummary" TEXT NOT NULL,
    "evidenceEventId" UUID,
    -- Soft pointer; the trusted-contact-reviews table lands in 9H. Stored
    -- here so the read side can fold the decision into the pause history.
    "trustedContactReviewId" UUID,
    "status" "GuardianPauseStatus" NOT NULL DEFAULT 'ACTIVE',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "resolutionNotes" TEXT,
    "continueAnywayCount" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pause_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "pause_events_userId_idx" ON "pause_events"("userId");
CREATE INDEX "pause_events_tenantId_idx" ON "pause_events"("tenantId");
CREATE INDEX "pause_events_status_idx" ON "pause_events"("status");
CREATE INDEX "pause_events_userId_startedAt_idx" ON "pause_events"("userId", "startedAt");

ALTER TABLE "pause_events" ADD CONSTRAINT "pause_events_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pause_events" ADD CONSTRAINT "pause_events_evidenceEventId_fkey"
  FOREIGN KEY ("evidenceEventId") REFERENCES "evidence_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;
