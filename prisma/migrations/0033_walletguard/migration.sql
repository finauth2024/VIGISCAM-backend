-- VIGISCAM Backend — Phase 9D: WalletGuard AI™.
-- Validates a crypto wallet attempt against per-network format rules,
-- pre-computed reputation, clipboard-swap detection (from the desktop
-- agent / browser extension), wallet-switch detection (the address
-- changed mid-session), Identity Graph cluster match, and verbal-pressure
-- context. HIGH/CRITICAL pulls Guardian Pause (9A).

CREATE TYPE "WalletNetwork" AS ENUM (
  'ETH',
  'BTC',
  'TRX',
  'SOL',
  'BSC',
  'MATIC',
  'ARBITRUM',
  'OPTIMISM',
  'OTHER'
);

CREATE TYPE "WalletReputation" AS ENUM (
  'UNKNOWN',
  'NEW',
  'KNOWN_RISKY',
  'SUSPICIOUS_WALLET',
  'CONFIRMED_SCAM'
);

CREATE TYPE "WalletGuardRiskLevel" AS ENUM (
  'LOW',
  'MEDIUM',
  'HIGH',
  'CRITICAL'
);

CREATE TYPE "WalletGuardDecision" AS ENUM (
  'PENDING',
  'VALIDATED',
  'BLOCKED',
  'ESCALATED_TO_TRUSTED_CONTACT',
  'CONTINUED_ANYWAY'
);

CREATE TABLE "wallet_checks" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tenantId" UUID,
    -- Inputs
    "network" "WalletNetwork" NOT NULL,
    "address" TEXT NOT NULL,
    "addressValid" BOOLEAN NOT NULL,
    "reputation" "WalletReputation" NOT NULL DEFAULT 'UNKNOWN',
    "clipboardSwapDetected" BOOLEAN NOT NULL DEFAULT false,
    "walletSwitched" BOOLEAN NOT NULL DEFAULT false,
    -- 0-100 Identity Collision Graph match score, supplied by the caller
    -- (9G upgrade) or left null when unknown.
    "graphMatchScore" INTEGER,
    "urgencyDetected" BOOLEAN NOT NULL DEFAULT false,
    "secrecyDetected" BOOLEAN NOT NULL DEFAULT false,
    "priorWarningsCount" INTEGER NOT NULL DEFAULT 0,
    -- Outputs
    "riskScore" INTEGER NOT NULL,
    "riskLevel" "WalletGuardRiskLevel" NOT NULL,
    "riskBreakdown" JSONB NOT NULL,
    "decision" "WalletGuardDecision" NOT NULL DEFAULT 'PENDING',
    "decidedAt" TIMESTAMP(3),
    "decisionNotes" TEXT,
    -- Cross-module joins
    "guardianPauseEventId" UUID,
    "evidenceEventId" UUID,
    "trustedContactReviewId" UUID,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wallet_checks_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "wallet_checks_userId_idx" ON "wallet_checks"("userId");
CREATE INDEX "wallet_checks_tenantId_idx" ON "wallet_checks"("tenantId");
CREATE INDEX "wallet_checks_address_idx" ON "wallet_checks"("address");
CREATE INDEX "wallet_checks_riskLevel_idx" ON "wallet_checks"("riskLevel");
CREATE INDEX "wallet_checks_userId_createdAt_idx" ON "wallet_checks"("userId", "createdAt");

ALTER TABLE "wallet_checks" ADD CONSTRAINT "wallet_checks_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "wallet_checks" ADD CONSTRAINT "wallet_checks_guardianPauseEventId_fkey"
  FOREIGN KEY ("guardianPauseEventId") REFERENCES "pause_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "wallet_checks" ADD CONSTRAINT "wallet_checks_evidenceEventId_fkey"
  FOREIGN KEY ("evidenceEventId") REFERENCES "evidence_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;
