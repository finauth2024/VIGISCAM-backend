-- Phase 10C — PlatformShield portal backend.
--
-- Two tables for platform tenants (dating apps, social platforms,
-- marketplaces) to record their own moderation actions on top of
-- VIGISCAM signals.
--
--   1. `grooming_check_scores` — every grooming-detection call is
--      logged with full breakdown for audit and the Phase 11B
--      real-model swap corpus.
--   2. `platform_moderation_decisions` — when a moderator acts on a
--      flagged claim verification, the decision lands here. One
--      decision per (claim, platform tenant).
--
-- Grooming inputs never include actual conversation text — only the
-- *signal flags* the platform's upstream pipeline derived. Keeps the
-- table free of message content and free of PII about minors.

CREATE TABLE "grooming_check_scores" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "moderatorUserId" UUID NOT NULL,
    "subjectReference" TEXT,
    "ageGapSignal" TEXT NOT NULL,
    "relationshipDurationDays" INTEGER,
    "loveBombingDetected" BOOLEAN NOT NULL DEFAULT false,
    "isolationLanguageDetected" BOOLEAN NOT NULL DEFAULT false,
    "paymentRequestDetected" BOOLEAN NOT NULL DEFAULT false,
    "photoSolicitationDetected" BOOLEAN NOT NULL DEFAULT false,
    "moveToPrivateChannelDetected" BOOLEAN NOT NULL DEFAULT false,
    "piiEscalationDetected" BOOLEAN NOT NULL DEFAULT false,
    "minorSuspected" BOOLEAN NOT NULL DEFAULT false,
    "riskScore" INTEGER NOT NULL,
    "riskLevel" TEXT NOT NULL,
    "recommendedAction" TEXT NOT NULL,
    "riskBreakdown" JSONB NOT NULL,
    "evidenceEventId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "grooming_check_scores_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "grooming_check_scores_tenantId_idx" ON "grooming_check_scores"("tenantId");
CREATE INDEX "grooming_check_scores_moderatorUserId_idx" ON "grooming_check_scores"("moderatorUserId");
CREATE INDEX "grooming_check_scores_riskLevel_idx" ON "grooming_check_scores"("riskLevel");
CREATE INDEX "grooming_check_scores_createdAt_idx" ON "grooming_check_scores"("createdAt");

CREATE TABLE "platform_moderation_decisions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "claimVerificationId" UUID NOT NULL,
    "decidedByUserId" UUID NOT NULL,
    "decision" TEXT NOT NULL,
    "notes" TEXT,
    "evidenceEventId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "platform_moderation_decisions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "platform_moderation_decisions_tenant_claim_unique"
        UNIQUE ("tenantId", "claimVerificationId")
);
CREATE INDEX "platform_moderation_decisions_tenantId_idx"
    ON "platform_moderation_decisions"("tenantId");
CREATE INDEX "platform_moderation_decisions_claimVerificationId_idx"
    ON "platform_moderation_decisions"("claimVerificationId");
CREATE INDEX "platform_moderation_decisions_decidedByUserId_idx"
    ON "platform_moderation_decisions"("decidedByUserId");

ALTER TABLE "platform_moderation_decisions"
    ADD CONSTRAINT "platform_moderation_decisions_claim_fkey"
    FOREIGN KEY ("claimVerificationId") REFERENCES "claim_verifications"("id") ON DELETE CASCADE;
