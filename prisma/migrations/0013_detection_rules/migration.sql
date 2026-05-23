-- VIGISCAM Backend — Phase 4B migration: detection rules pattern library.

-- CreateEnum
CREATE TYPE "DetectionRuleType" AS ENUM ('PHRASE_MATCH', 'INDICATOR_PATTERN', 'CATEGORY_RULE', 'COMBINED');

-- CreateEnum
CREATE TYPE "DetectionRuleStatus" AS ENUM ('DRAFT', 'TESTING', 'ACTIVE', 'DISABLED', 'RETIRED');

-- CreateTable
CREATE TABLE "detection_rules" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "ruleType" "DetectionRuleType" NOT NULL,
    "pattern" JSONB NOT NULL,
    "category" TEXT,
    "severity" "RiskLevel" NOT NULL DEFAULT 'MEDIUM',
    "status" "DetectionRuleStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "sourceClusterId" UUID,
    "createdByUserId" UUID,
    "activatedByUserId" UUID,
    "activatedAt" TIMESTAMP(3),
    "disabledAt" TIMESTAMP(3),
    "retiredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "detection_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "detection_rules_status_idx" ON "detection_rules"("status");

-- CreateIndex
CREATE INDEX "detection_rules_ruleType_idx" ON "detection_rules"("ruleType");

-- AddForeignKey
ALTER TABLE "detection_rules" ADD CONSTRAINT "detection_rules_sourceClusterId_fkey" FOREIGN KEY ("sourceClusterId") REFERENCES "scam_clusters"("id") ON DELETE SET NULL ON UPDATE CASCADE;
