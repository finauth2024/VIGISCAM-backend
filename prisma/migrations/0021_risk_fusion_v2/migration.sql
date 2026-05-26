-- VIGISCAM Backend — Phase 6E migration: Fraud Journey + VictimState +
-- Predicted Next Move + Risk Fusion v2.

-- CreateEnum
CREATE TYPE "FraudJourneyStage" AS ENUM ('INITIAL_CONTACT', 'TRUST_BUILDING', 'INFORMATION_GATHERING', 'URGENCY_INJECTION', 'PAYMENT_REQUEST', 'COMPLETED', 'INTERVENED');

-- CreateEnum
CREATE TYPE "VictimStateLabel" AS ENUM ('CALM', 'CONFUSED', 'PRESSURED', 'TRUSTING', 'ALARMED', 'COMPROMISED');

-- CreateEnum
CREATE TYPE "PredictedAction" AS ENUM ('REQUEST_PAYMENT', 'REQUEST_REMOTE_ACCESS', 'REQUEST_GIFT_CARD', 'REQUEST_PERSONAL_INFO', 'ESCALATE_URGENCY', 'DROP_OFF');

-- CreateTable
CREATE TABLE "fraud_journey_assessments" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "stage" "FraudJourneyStage" NOT NULL,
    "confidence" INTEGER NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "source" "AIDecisionSource" NOT NULL DEFAULT 'STUB',
    "evidence" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fraud_journey_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "victim_state_assessments" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "state" "VictimStateLabel" NOT NULL,
    "confidence" INTEGER NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "source" "AIDecisionSource" NOT NULL DEFAULT 'STUB',
    "signals" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "victim_state_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "predicted_next_moves" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "action" "PredictedAction" NOT NULL,
    "confidence" INTEGER NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "source" "AIDecisionSource" NOT NULL DEFAULT 'STUB',
    "rationale" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "predicted_next_moves_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "risk_fusion_assessments" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "fusedScore" INTEGER NOT NULL,
    "fusedLevel" "RiskLevel" NOT NULL,
    "breakdown" JSONB NOT NULL,
    "fusedVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "risk_fusion_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fraud_journey_assessments_sessionId_idx" ON "fraud_journey_assessments"("sessionId");

-- CreateIndex
CREATE INDEX "fraud_journey_assessments_stage_idx" ON "fraud_journey_assessments"("stage");

-- CreateIndex
CREATE INDEX "victim_state_assessments_sessionId_idx" ON "victim_state_assessments"("sessionId");

-- CreateIndex
CREATE INDEX "victim_state_assessments_state_idx" ON "victim_state_assessments"("state");

-- CreateIndex
CREATE INDEX "predicted_next_moves_sessionId_idx" ON "predicted_next_moves"("sessionId");

-- CreateIndex
CREATE INDEX "predicted_next_moves_action_idx" ON "predicted_next_moves"("action");

-- CreateIndex
CREATE INDEX "risk_fusion_assessments_sessionId_idx" ON "risk_fusion_assessments"("sessionId");

-- CreateIndex
CREATE INDEX "risk_fusion_assessments_fusedLevel_idx" ON "risk_fusion_assessments"("fusedLevel");

-- AddForeignKey
ALTER TABLE "fraud_journey_assessments" ADD CONSTRAINT "fraud_journey_assessments_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "victim_state_assessments" ADD CONSTRAINT "victim_state_assessments_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "predicted_next_moves" ADD CONSTRAINT "predicted_next_moves_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk_fusion_assessments" ADD CONSTRAINT "risk_fusion_assessments_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
