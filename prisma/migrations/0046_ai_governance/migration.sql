-- CP-7 — model version registry + AI reviewer feedback loop (brief §5/§17/§18).

CREATE TYPE "AIDecisionReviewStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CORRECTED', 'NOT_REQUIRED');
CREATE TYPE "AIReviewerLabel" AS ENUM ('CONFIRMED_CORRECT', 'FALSE_POSITIVE', 'FALSE_NEGATIVE', 'CORRECTED_CATEGORY', 'INCONCLUSIVE_ACCEPTED');
CREATE TYPE "ModelStatus" AS ENUM ('DRAFT', 'SHADOW', 'ACTIVE', 'RETIRED');

-- Reviewer-feedback columns on the AI decision audit trail.
ALTER TABLE "ai_decisions"
  ADD COLUMN "requiresHumanReview" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "reviewStatus" "AIDecisionReviewStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "reviewerLabel" "AIReviewerLabel",
  ADD COLUMN "reviewedByUserId" UUID,
  ADD COLUMN "reviewedAt" TIMESTAMP(3),
  ADD COLUMN "reviewNotes" TEXT,
  ADD COLUMN "modelRegistryId" UUID;

CREATE INDEX "ai_decisions_reviewStatus_idx" ON "ai_decisions"("reviewStatus");
CREATE INDEX "ai_decisions_requiresHumanReview_idx" ON "ai_decisions"("requiresHumanReview");

-- Model version registry.
CREATE TABLE "model_registry" (
  "id"                 UUID NOT NULL,
  "serviceKind"        TEXT NOT NULL,
  "modelName"          TEXT NOT NULL,
  "version"            TEXT NOT NULL,
  "status"             "ModelStatus" NOT NULL DEFAULT 'DRAFT',
  "source"             "AIDecisionSource" NOT NULL DEFAULT 'EXTERNAL',
  "metrics"            JSONB,
  "notes"              TEXT,
  "registeredByUserId" UUID,
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"          TIMESTAMP(3) NOT NULL,
  CONSTRAINT "model_registry_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "model_registry_serviceKind_version_key" ON "model_registry"("serviceKind", "version");
CREATE INDEX "model_registry_serviceKind_status_idx" ON "model_registry"("serviceKind", "status");

-- Reviewer corrections = active-learning dataset.
CREATE TABLE "model_feedback" (
  "id"               UUID NOT NULL,
  "aiDecisionId"     UUID NOT NULL,
  "serviceKind"      TEXT NOT NULL,
  "modelVersion"     TEXT NOT NULL,
  "reviewerLabel"    "AIReviewerLabel" NOT NULL,
  "correctedOutput"  JSONB,
  "notes"            TEXT,
  "reviewedByUserId" UUID NOT NULL,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "model_feedback_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "model_feedback_serviceKind_idx" ON "model_feedback"("serviceKind");
CREATE INDEX "model_feedback_aiDecisionId_idx" ON "model_feedback"("aiDecisionId");
CREATE INDEX "model_feedback_createdAt_idx" ON "model_feedback"("createdAt");
