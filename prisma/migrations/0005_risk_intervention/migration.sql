-- VIGISCAM Backend — Phase 1D migration: risk events, FreezeLock, alerts.

-- CreateEnum
CREATE TYPE "RiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "RiskEventStatus" AS ENUM ('OPEN', 'INTERVENING', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "RiskModuleSource" AS ENUM ('RISK_FUSION', 'FREEZEGUARD', 'A1SCAMSHIELD', 'GUARDIAN_PAUSE', 'SCAMHOLD', 'GIFTCARDGUARD', 'WALLETGUARD', 'CLAIMVERIFY', 'MANUAL');

-- CreateEnum
CREATE TYPE "FreezeLockStatus" AS ENUM ('EXECUTED', 'CLEARED', 'FAILED');

-- CreateEnum
CREATE TYPE "AlertSeverity" AS ENUM ('INFO', 'WARNING', 'HIGH', 'CRITICAL');

-- CreateTable
CREATE TABLE "risk_events" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "sessionId" UUID,
    "moduleSource" "RiskModuleSource" NOT NULL,
    "eventType" TEXT NOT NULL,
    "riskScore" INTEGER NOT NULL,
    "riskLevel" "RiskLevel" NOT NULL,
    "status" "RiskEventStatus" NOT NULL DEFAULT 'OPEN',
    "triggerReason" TEXT NOT NULL,
    "recommendedAction" TEXT NOT NULL,
    "detectedSignals" TEXT[],
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "risk_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "freezelock_events" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "riskEventId" UUID,
    "sessionId" UUID,
    "trigger" TEXT NOT NULL,
    "actions" TEXT[],
    "status" "FreezeLockStatus" NOT NULL DEFAULT 'EXECUTED',
    "executedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "freezelock_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alerts" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "riskEventId" UUID,
    "type" TEXT NOT NULL,
    "severity" "AlertSeverity" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "risk_events_userId_idx" ON "risk_events"("userId");

-- CreateIndex
CREATE INDEX "risk_events_tenantId_idx" ON "risk_events"("tenantId");

-- CreateIndex
CREATE INDEX "risk_events_riskLevel_idx" ON "risk_events"("riskLevel");

-- CreateIndex
CREATE INDEX "risk_events_status_idx" ON "risk_events"("status");

-- CreateIndex
CREATE INDEX "freezelock_events_userId_idx" ON "freezelock_events"("userId");

-- CreateIndex
CREATE INDEX "freezelock_events_tenantId_idx" ON "freezelock_events"("tenantId");

-- CreateIndex
CREATE INDEX "alerts_userId_idx" ON "alerts"("userId");

-- CreateIndex
CREATE INDEX "alerts_tenantId_idx" ON "alerts"("tenantId");

-- CreateIndex
CREATE INDEX "alerts_readAt_idx" ON "alerts"("readAt");

-- AddForeignKey
ALTER TABLE "risk_events" ADD CONSTRAINT "risk_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk_events" ADD CONSTRAINT "risk_events_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "freezelock_events" ADD CONSTRAINT "freezelock_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "freezelock_events" ADD CONSTRAINT "freezelock_events_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "freezelock_events" ADD CONSTRAINT "freezelock_events_riskEventId_fkey" FOREIGN KEY ("riskEventId") REFERENCES "risk_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_riskEventId_fkey" FOREIGN KEY ("riskEventId") REFERENCES "risk_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;
