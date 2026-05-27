-- VIGISCAM Backend — Phase 7F migration: regional public alert systems.

-- CreateEnum
CREATE TYPE "PublicAlertSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');

-- CreateEnum
CREATE TYPE "PublicAlertStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'EXPIRED', 'WITHDRAWN');

-- AlterEnum (Pg 12+: ADD VALUE works in a transaction as long as the new
-- value isn't referenced before COMMIT — we only add it here.)
ALTER TYPE "WebhookEventType" ADD VALUE 'PUBLIC_ALERT_PUBLISHED';

-- CreateTable
CREATE TABLE "public_alerts" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "severity" "PublicAlertSeverity" NOT NULL DEFAULT 'WARNING',
    "category" TEXT,
    "registryEntryIds" UUID[],
    "status" "PublicAlertStatus" NOT NULL DEFAULT 'DRAFT',
    "createdByUserId" UUID,
    "publishedByUserId" UUID,
    "publishedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "withdrawnAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "public_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "public_alerts_region_idx" ON "public_alerts"("region");
CREATE INDEX "public_alerts_status_idx" ON "public_alerts"("status");
CREATE INDEX "public_alerts_severity_idx" ON "public_alerts"("severity");
CREATE INDEX "public_alerts_publishedAt_idx" ON "public_alerts"("publishedAt");
