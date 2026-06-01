-- Phase 10B — BankGuard portal backend.
--
-- Two thin additions on top of the Phase 9 substrate:
--   1. `teller_assist_scores` — every teller-assist scoring call is logged
--      so the bank can audit decisions and so we have a feedback corpus
--      for the Phase 11B real-model swap.
--   2. `bank_case_reviews` — when a bank analyst reviews an escalated
--      ScamHold case, their professional opinion lands here as its own
--      row (the customer's own decision still lives on the ScamHold
--      event). One review per (case, bank tenant).
--
-- Both tables are scoped to a bank tenant (the bank's tenantId from JWT)
-- and indexed for the queue endpoints in bank-portal.service.ts.

CREATE TABLE "teller_assist_scores" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "tellerUserId" UUID NOT NULL,
    "customerReference" TEXT,
    "transactionChannel" TEXT NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "recipientType" TEXT NOT NULL,
    "customerStatedReason" TEXT,
    "behaviorSignals" JSONB,
    "riskScore" INTEGER NOT NULL,
    "riskLevel" TEXT NOT NULL,
    "recommendedAction" TEXT NOT NULL,
    "riskBreakdown" JSONB NOT NULL,
    "evidenceEventId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "teller_assist_scores_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "teller_assist_scores_tenantId_idx" ON "teller_assist_scores"("tenantId");
CREATE INDEX "teller_assist_scores_tellerUserId_idx" ON "teller_assist_scores"("tellerUserId");
CREATE INDEX "teller_assist_scores_riskLevel_idx" ON "teller_assist_scores"("riskLevel");
CREATE INDEX "teller_assist_scores_createdAt_idx" ON "teller_assist_scores"("createdAt");

CREATE TABLE "bank_case_reviews" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "scamHoldEventId" UUID NOT NULL,
    "reviewedByUserId" UUID NOT NULL,
    "decision" TEXT NOT NULL,
    "notes" TEXT,
    "evidenceEventId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "bank_case_reviews_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "bank_case_reviews_tenant_case_unique" UNIQUE ("tenantId", "scamHoldEventId")
);
CREATE INDEX "bank_case_reviews_tenantId_idx" ON "bank_case_reviews"("tenantId");
CREATE INDEX "bank_case_reviews_scamHoldEventId_idx" ON "bank_case_reviews"("scamHoldEventId");
CREATE INDEX "bank_case_reviews_reviewedByUserId_idx" ON "bank_case_reviews"("reviewedByUserId");

ALTER TABLE "bank_case_reviews"
    ADD CONSTRAINT "bank_case_reviews_scamhold_fkey"
    FOREIGN KEY ("scamHoldEventId") REFERENCES "scamhold_events"("id") ON DELETE CASCADE;
