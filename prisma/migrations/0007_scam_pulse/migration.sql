-- VIGISCAM Backend — Phase 2A migration: ScamPulse Intelligence Foundation.

-- CreateEnum
CREATE TYPE "IndicatorType" AS ENUM ('PHONE', 'EMAIL', 'DOMAIN', 'URL', 'CRYPTO_WALLET', 'SCAM_PHRASE', 'FAKE_COMPANY', 'SOCIAL_PROFILE', 'OTHER');

-- CreateEnum
CREATE TYPE "SignalSourceType" AS ENUM ('USER_REPORT', 'PARTNER_REPORT', 'BANK_REPORT', 'INVESTIGATOR', 'GOVERNMENT_ADVISORY', 'PUBLIC_WEB', 'INTERNAL');

-- CreateEnum
CREATE TYPE "ScamSignalStatus" AS ENUM ('UNVERIFIED_REPORT', 'SUSPICIOUS_SIGNAL', 'PATTERN_MATCH', 'UNDER_REVIEW', 'HIGH_RISK_INDICATOR', 'VERIFIED_SCAM_INTELLIGENCE', 'PUBLIC_SAFE_ALERT', 'ARCHIVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "RegistryEntryStatus" AS ENUM ('CANDIDATE', 'UNDER_REVIEW', 'APPROVED_PUBLIC_SAFE', 'PUBLISHED', 'REJECTED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ReviewQueueStatus" AS ENUM ('PENDING', 'IN_REVIEW', 'COMPLETED');

-- CreateTable
CREATE TABLE "scam_categories" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "riskWeight" INTEGER NOT NULL DEFAULT 50,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scam_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "source_reliability_profiles" (
    "id" UUID NOT NULL,
    "sourceType" TEXT NOT NULL,
    "baseReliabilityScore" INTEGER NOT NULL,
    "requiresReview" BOOLEAN NOT NULL DEFAULT true,
    "allowedForPublicRegistry" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "source_reliability_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scam_signals" (
    "id" UUID NOT NULL,
    "tenantId" UUID,
    "submittedByUserId" UUID,
    "sourceType" "SignalSourceType" NOT NULL,
    "sourceName" TEXT,
    "category" TEXT,
    "indicatorType" "IndicatorType" NOT NULL,
    "indicatorValue" TEXT NOT NULL,
    "normalizedIndicator" TEXT NOT NULL,
    "description" TEXT,
    "rawText" TEXT,
    "reportCount" INTEGER NOT NULL DEFAULT 1,
    "confidenceScore" INTEGER NOT NULL DEFAULT 0,
    "sourceReliabilityScore" INTEGER NOT NULL DEFAULT 0,
    "evidenceStrengthScore" INTEGER NOT NULL DEFAULT 0,
    "recencyScore" INTEGER NOT NULL DEFAULT 0,
    "status" "ScamSignalStatus" NOT NULL DEFAULT 'UNVERIFIED_REPORT',
    "geography" TEXT,
    "firstSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clusterId" UUID,
    "publicSafeCandidate" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scam_signals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scam_signal_evidence" (
    "id" UUID NOT NULL,
    "signalId" UUID NOT NULL,
    "evidenceType" TEXT NOT NULL,
    "evidenceSummary" TEXT,
    "fileUrl" TEXT,
    "sourceUrl" TEXT,
    "hashValue" TEXT,
    "submittedByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scam_signal_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "registry_entries" (
    "id" UUID NOT NULL,
    "indicatorType" "IndicatorType" NOT NULL,
    "indicatorValue" TEXT NOT NULL,
    "normalizedIndicator" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "status" "RegistryEntryStatus" NOT NULL DEFAULT 'CANDIDATE',
    "confidenceScore" INTEGER NOT NULL DEFAULT 0,
    "publicSafeSummary" TEXT NOT NULL,
    "recommendedAction" TEXT,
    "firstSeen" TIMESTAMP(3),
    "lastSeen" TIMESTAMP(3),
    "evidenceCount" INTEGER NOT NULL DEFAULT 0,
    "sourceSignalId" UUID,
    "approvedByUserId" UUID,
    "approvedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "registry_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "registry_review_queue" (
    "id" UUID NOT NULL,
    "signalId" UUID,
    "registryEntryId" UUID,
    "reviewStatus" "ReviewQueueStatus" NOT NULL DEFAULT 'PENDING',
    "publicSafe" BOOLEAN NOT NULL DEFAULT false,
    "assignedToUserId" UUID,
    "reviewNotes" TEXT,
    "decision" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "registry_review_queue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scam_check_results" (
    "id" UUID NOT NULL,
    "userId" UUID,
    "tenantId" UUID,
    "inputType" "IndicatorType" NOT NULL,
    "inputValue" TEXT NOT NULL,
    "normalizedInput" TEXT NOT NULL,
    "riskScore" INTEGER NOT NULL,
    "riskLevel" "RiskLevel" NOT NULL,
    "category" TEXT,
    "matchedRegistry" JSONB,
    "matchedSignals" JSONB,
    "suggestedAction" TEXT NOT NULL,
    "savedToEvidence" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scam_check_results_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "scam_categories_code_key" ON "scam_categories"("code");

-- CreateIndex
CREATE UNIQUE INDEX "source_reliability_profiles_sourceType_key" ON "source_reliability_profiles"("sourceType");

-- CreateIndex
CREATE INDEX "scam_signals_normalizedIndicator_idx" ON "scam_signals"("normalizedIndicator");

-- CreateIndex
CREATE INDEX "scam_signals_indicatorType_idx" ON "scam_signals"("indicatorType");

-- CreateIndex
CREATE INDEX "scam_signals_status_idx" ON "scam_signals"("status");

-- CreateIndex
CREATE INDEX "scam_signals_tenantId_idx" ON "scam_signals"("tenantId");

-- CreateIndex
CREATE INDEX "scam_signal_evidence_signalId_idx" ON "scam_signal_evidence"("signalId");

-- CreateIndex
CREATE INDEX "registry_entries_normalizedIndicator_idx" ON "registry_entries"("normalizedIndicator");

-- CreateIndex
CREATE INDEX "registry_entries_indicatorType_idx" ON "registry_entries"("indicatorType");

-- CreateIndex
CREATE INDEX "registry_entries_status_idx" ON "registry_entries"("status");

-- CreateIndex
CREATE INDEX "registry_review_queue_reviewStatus_idx" ON "registry_review_queue"("reviewStatus");

-- CreateIndex
CREATE INDEX "scam_check_results_userId_idx" ON "scam_check_results"("userId");

-- CreateIndex
CREATE INDEX "scam_check_results_normalizedInput_idx" ON "scam_check_results"("normalizedInput");

-- AddForeignKey
ALTER TABLE "scam_signal_evidence" ADD CONSTRAINT "scam_signal_evidence_signalId_fkey" FOREIGN KEY ("signalId") REFERENCES "scam_signals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─────────────── Seed: scam categories (PDF §12) ───────────────
INSERT INTO "scam_categories" ("id", "code", "name", "description", "riskWeight") VALUES
  (gen_random_uuid(), 'TECH_SUPPORT_SCAM', 'Tech Support Scam', 'Impersonating tech support to gain remote access or payment', 75),
  (gen_random_uuid(), 'ROMANCE_SCAM', 'Romance Scam', 'Building a fake romantic relationship to extract money', 70),
  (gen_random_uuid(), 'GIFT_CARD_SCAM', 'Gift Card Scam', 'Coercing the victim into buying and sharing gift card codes', 80),
  (gen_random_uuid(), 'CRYPTO_SCAM', 'Crypto Scam', 'Fraudulent crypto investment or transfer schemes', 80),
  (gen_random_uuid(), 'GOVERNMENT_IMPERSONATION', 'Government Impersonation', 'Posing as a government agency to threaten or extract payment', 78),
  (gen_random_uuid(), 'BANK_IMPERSONATION', 'Bank Impersonation', 'Posing as a bank to move money to a "safe account"', 82),
  (gen_random_uuid(), 'MARKETPLACE_SCAM', 'Marketplace Scam', 'Fraud on buying/selling marketplaces', 55),
  (gen_random_uuid(), 'FAKE_JOB_SCAM', 'Fake Job Scam', 'Fake employment offers used to extract money or data', 60),
  (gen_random_uuid(), 'REMOTE_ACCESS_SCAM', 'Remote Access Scam', 'Tricking the victim into granting remote device control', 85),
  (gen_random_uuid(), 'DONATION_SCAM', 'Donation Scam', 'Fake charity or donation solicitations', 50),
  (gen_random_uuid(), 'BUSINESS_EMAIL_COMPROMISE', 'Business Email Compromise', 'Impersonating a business contact to redirect payments', 80),
  (gen_random_uuid(), 'FAKE_INVOICE_SCAM', 'Fake Invoice Scam', 'Fraudulent invoices demanding payment', 60),
  (gen_random_uuid(), 'LOTTERY_PRIZE_SCAM', 'Lottery / Prize Scam', 'Fake winnings requiring an upfront fee', 55),
  (gen_random_uuid(), 'FAMILY_EMERGENCY_SCAM', 'Family Emergency Scam', 'Posing as a relative in crisis to extract urgent payment', 72),
  (gen_random_uuid(), 'UTILITY_IMPERSONATION', 'Utility Impersonation', 'Posing as a utility provider threatening disconnection', 58),
  (gen_random_uuid(), 'PAYPAL_PAYMENT_SCAM', 'Payment App Scam', 'Fraud via PayPal and similar payment apps', 58),
  (gen_random_uuid(), 'SOCIAL_MEDIA_IMPERSONATION', 'Social Media Impersonation', 'Fake or cloned social media profiles', 55),
  (gen_random_uuid(), 'INVESTMENT_SCAM', 'Investment Scam', 'Fraudulent investment opportunities', 78),
  (gen_random_uuid(), 'SEXTORTION', 'Sextortion', 'Threats to release intimate material unless paid', 80),
  (gen_random_uuid(), 'RECOVERY_SCAM', 'Recovery Scam', 'Fake promises to recover money already lost', 70),
  (gen_random_uuid(), 'CHECK_FRAUD', 'Check Fraud', 'Fraudulent or overpayment check schemes', 60),
  (gen_random_uuid(), 'CARDING', 'Carding', 'Stolen-card testing and fraudulent transactions', 65),
  (gen_random_uuid(), 'DEEPFAKE_IMPERSONATION', 'Deepfake Impersonation', 'Synthetic audio/video used to impersonate a trusted person', 82)
ON CONFLICT ("code") DO NOTHING;

-- ─────────── Seed: source reliability profiles (PDF §31) ───────────
INSERT INTO "source_reliability_profiles"
  ("id", "sourceType", "baseReliabilityScore", "requiresReview", "allowedForPublicRegistry", "notes", "updatedAt") VALUES
  (gen_random_uuid(), 'GOVERNMENT_ADVISORY', 95, false, true,  'Verified government advisory', NOW()),
  (gen_random_uuid(), 'BANK_REPORT',        85, true,  true,  'Bank partner report', NOW()),
  (gen_random_uuid(), 'PARTNER_REPORT',     80, true,  true,  'Trusted business partner report', NOW()),
  (gen_random_uuid(), 'INVESTIGATOR',       80, true,  true,  'Verified investigator submission', NOW()),
  (gen_random_uuid(), 'INTERNAL',           70, true,  false, 'Internal VIGISCAM analyst', NOW()),
  (gen_random_uuid(), 'USER_REPORT',        35, true,  false, 'Single user report', NOW()),
  (gen_random_uuid(), 'PUBLIC_WEB',         25, true,  false, 'Unverified public web signal', NOW())
ON CONFLICT ("sourceType") DO NOTHING;
