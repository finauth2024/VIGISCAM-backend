-- VIGISCAM Backend — Phase 6A migration: AI decision audit trail.

-- CreateEnum
CREATE TYPE "AIDecisionSource" AS ENUM ('STUB', 'EXTERNAL');

-- CreateTable
CREATE TABLE "ai_decisions" (
    "id" UUID NOT NULL,
    "serviceKind" TEXT NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "source" "AIDecisionSource" NOT NULL DEFAULT 'STUB',
    "entityType" TEXT,
    "entityId" TEXT,
    "inputDigest" TEXT NOT NULL,
    "inputSnippet" TEXT,
    "output" JSONB NOT NULL,
    "confidence" INTEGER,
    "durationMs" INTEGER,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_decisions_serviceKind_idx" ON "ai_decisions"("serviceKind");

-- CreateIndex
CREATE INDEX "ai_decisions_entityType_entityId_idx" ON "ai_decisions"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "ai_decisions_modelVersion_idx" ON "ai_decisions"("modelVersion");

-- CreateIndex
CREATE INDEX "ai_decisions_createdAt_idx" ON "ai_decisions"("createdAt");
