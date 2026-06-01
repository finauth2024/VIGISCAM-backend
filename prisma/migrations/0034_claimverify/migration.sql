-- VIGISCAM Backend — Phase 9E: ClaimVerify AI™.
-- Verifies the claim a stranger makes ("I'm a contractor with a road
-- project", "I'm a doctor needing money for a sick relative") against
-- subject signals: domain age, location mismatch, image reuse, scam-
-- phrase NLP score, payment-pressure / secrecy / urgency.
-- HIGH/CRITICAL pulls Guardian Pause (9A) and feeds the suspicious
-- claim back into ScamPulse signal intake (TODO until 11B wires it).

CREATE TYPE "ClaimVerifyType" AS ENUM (
  'ROMANCE',
  'INVESTMENT',
  'CHARITY',
  'HOSPITAL',
  'MEDICAL_EMERGENCY',
  'OIL_PROJECT',
  'GOLD_PROJECT',
  'ROAD_CONSTRUCTION',
  'BUSINESS_PARTNERSHIP',
  'INHERITANCE',
  'LEGAL_CLAIM',
  'GOVERNMENT',
  'IMMIGRATION',
  'JOB',
  'WORK_FROM_HOME',
  'OTHER'
);

CREATE TYPE "ClaimVerifyRiskLevel" AS ENUM (
  'LOW',
  'MEDIUM',
  'HIGH',
  'CRITICAL'
);

CREATE TYPE "ClaimVerifyDecision" AS ENUM (
  'PENDING',
  'TRUSTED',
  'REJECTED',
  'ESCALATED_TO_TRUSTED_CONTACT',
  'CONTINUED_ANYWAY'
);

CREATE TABLE "claim_verifications" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tenantId" UUID,
    -- Inputs
    "claimType" "ClaimVerifyType" NOT NULL,
    "subject" JSONB NOT NULL,
    -- Detection-side signals (provided by callers from upstream OSINT
    -- + perceptual-hash + NLP services; ClaimVerify itself doesn't run
    -- those — it composes the score).
    "domainAgeDays" INTEGER,
    "locationMismatch" BOOLEAN NOT NULL DEFAULT false,
    "imageReuseDetected" BOOLEAN NOT NULL DEFAULT false,
    "scamPhraseScore" INTEGER,
    "paymentPressure" BOOLEAN NOT NULL DEFAULT false,
    "secrecyDetected" BOOLEAN NOT NULL DEFAULT false,
    "urgencyDetected" BOOLEAN NOT NULL DEFAULT false,
    "priorWarningsCount" INTEGER NOT NULL DEFAULT 0,
    -- Outputs
    "riskScore" INTEGER NOT NULL,
    "riskLevel" "ClaimVerifyRiskLevel" NOT NULL,
    "riskBreakdown" JSONB NOT NULL,
    "decision" "ClaimVerifyDecision" NOT NULL DEFAULT 'PENDING',
    "decidedAt" TIMESTAMP(3),
    "decisionNotes" TEXT,
    -- Cross-module joins
    "guardianPauseEventId" UUID,
    "evidenceEventId" UUID,
    "trustedContactReviewId" UUID,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "claim_verifications_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "claim_verifications_userId_idx" ON "claim_verifications"("userId");
CREATE INDEX "claim_verifications_tenantId_idx" ON "claim_verifications"("tenantId");
CREATE INDEX "claim_verifications_claimType_idx" ON "claim_verifications"("claimType");
CREATE INDEX "claim_verifications_riskLevel_idx" ON "claim_verifications"("riskLevel");
CREATE INDEX "claim_verifications_userId_createdAt_idx" ON "claim_verifications"("userId", "createdAt");

ALTER TABLE "claim_verifications" ADD CONSTRAINT "claim_verifications_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "claim_verifications" ADD CONSTRAINT "claim_verifications_guardianPauseEventId_fkey"
  FOREIGN KEY ("guardianPauseEventId") REFERENCES "pause_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "claim_verifications" ADD CONSTRAINT "claim_verifications_evidenceEventId_fkey"
  FOREIGN KEY ("evidenceEventId") REFERENCES "evidence_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;
