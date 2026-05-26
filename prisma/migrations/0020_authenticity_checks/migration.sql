-- VIGISCAM Backend — Phase 6D migration: Authenticity Verification Suite verdicts.

-- CreateEnum
CREATE TYPE "AuthenticityCheckType" AS ENUM ('LIVE_FACE_SEAL', 'VOICE_MATCH_SEAL', 'SCENE_SEAL', 'CAM_VIGUARD', 'DUAL_AUTH', 'ANTI_FAKE_VIDEO');

-- CreateEnum
CREATE TYPE "AuthenticityResult" AS ENUM ('PASS', 'FAIL', 'INCONCLUSIVE');

-- CreateTable
CREATE TABLE "authenticity_checks" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "checkType" "AuthenticityCheckType" NOT NULL,
    "result" "AuthenticityResult" NOT NULL,
    "score" INTEGER NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "source" "AIDecisionSource" NOT NULL DEFAULT 'STUB',
    "metadata" JSONB,
    "requestedByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "authenticity_checks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "authenticity_checks_sessionId_idx" ON "authenticity_checks"("sessionId");

-- CreateIndex
CREATE INDEX "authenticity_checks_checkType_idx" ON "authenticity_checks"("checkType");

-- CreateIndex
CREATE INDEX "authenticity_checks_result_idx" ON "authenticity_checks"("result");

-- AddForeignKey
ALTER TABLE "authenticity_checks" ADD CONSTRAINT "authenticity_checks_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
