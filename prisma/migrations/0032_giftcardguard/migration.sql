-- VIGISCAM Backend — Phase 9C: GiftCardGuard™.
-- Tracks gift-card-related scam attempts: scratch/read-code prompts,
-- photo-of-code asks, impersonation patterns (gov/bank/tech-support/etc),
-- urgency + secrecy. Any gift-card request is already MEDIUM by default
-- — gift cards are the scammer-favourite payment method.

CREATE TYPE "GiftCardGuardImpersonationType" AS ENUM (
  'NONE',
  'GOVERNMENT',
  'BANK',
  'TECH_SUPPORT',
  'LAW_ENFORCEMENT',
  'EMPLOYER',
  'ROMANCE',
  'UTILITY',
  'CHARITY',
  'OTHER'
);

CREATE TYPE "GiftCardGuardRiskLevel" AS ENUM (
  'LOW',
  'MEDIUM',
  'HIGH',
  'CRITICAL'
);

CREATE TYPE "GiftCardGuardDecision" AS ENUM (
  'PENDING',
  'AVOIDED',
  'CONTINUED_ANYWAY',
  'ESCALATED_TO_TRUSTED_CONTACT'
);

CREATE TABLE "giftcard_warnings" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tenantId" UUID,
    -- Inputs
    "cardBrand" TEXT,
    "denominationMinor" BIGINT,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "codeRevealRequested" BOOLEAN NOT NULL DEFAULT false,
    "photoOfCodeRequested" BOOLEAN NOT NULL DEFAULT false,
    "impersonationType" "GiftCardGuardImpersonationType" NOT NULL DEFAULT 'NONE',
    "urgencyDetected" BOOLEAN NOT NULL DEFAULT false,
    "secrecyDetected" BOOLEAN NOT NULL DEFAULT false,
    "elderModeActive" BOOLEAN NOT NULL DEFAULT false,
    "priorWarningsCount" INTEGER NOT NULL DEFAULT 0,
    -- Outputs
    "riskScore" INTEGER NOT NULL,
    "riskLevel" "GiftCardGuardRiskLevel" NOT NULL,
    "riskBreakdown" JSONB NOT NULL,
    "decision" "GiftCardGuardDecision" NOT NULL DEFAULT 'PENDING',
    "decidedAt" TIMESTAMP(3),
    "decisionNotes" TEXT,
    -- Cross-module joins
    "guardianPauseEventId" UUID,
    "evidenceEventId" UUID,
    "trustedContactReviewId" UUID,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "giftcard_warnings_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "giftcard_warnings_userId_idx" ON "giftcard_warnings"("userId");
CREATE INDEX "giftcard_warnings_tenantId_idx" ON "giftcard_warnings"("tenantId");
CREATE INDEX "giftcard_warnings_decision_idx" ON "giftcard_warnings"("decision");
CREATE INDEX "giftcard_warnings_riskLevel_idx" ON "giftcard_warnings"("riskLevel");
CREATE INDEX "giftcard_warnings_userId_createdAt_idx" ON "giftcard_warnings"("userId", "createdAt");

ALTER TABLE "giftcard_warnings" ADD CONSTRAINT "giftcard_warnings_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "giftcard_warnings" ADD CONSTRAINT "giftcard_warnings_guardianPauseEventId_fkey"
  FOREIGN KEY ("guardianPauseEventId") REFERENCES "pause_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "giftcard_warnings" ADD CONSTRAINT "giftcard_warnings_evidenceEventId_fkey"
  FOREIGN KEY ("evidenceEventId") REFERENCES "evidence_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;
