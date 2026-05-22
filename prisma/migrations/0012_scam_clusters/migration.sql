-- VIGISCAM Backend — Phase 4A migration: scam signal clusters.

-- CreateEnum
CREATE TYPE "ClusterMatchType" AS ENUM ('SHARED_INDICATOR', 'SHARED_DOMAIN_ROOT', 'SHARED_PHONE', 'SHARED_EMAIL', 'SHARED_WALLET', 'SHARED_PHRASE', 'SHARED_CATEGORY', 'MANUAL');

-- CreateEnum
CREATE TYPE "ClusterStatus" AS ENUM ('ACTIVE', 'MONITORING', 'ARCHIVED');

-- CreateTable
CREATE TABLE "scam_clusters" (
    "id" UUID NOT NULL,
    "clusterKey" TEXT NOT NULL,
    "matchType" "ClusterMatchType" NOT NULL,
    "label" TEXT NOT NULL,
    "category" TEXT,
    "status" "ClusterStatus" NOT NULL DEFAULT 'ACTIVE',
    "signalCount" INTEGER NOT NULL DEFAULT 0,
    "confidenceScore" INTEGER NOT NULL DEFAULT 0,
    "firstSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scam_clusters_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "scam_clusters_clusterKey_key" ON "scam_clusters"("clusterKey");

-- CreateIndex
CREATE INDEX "scam_clusters_matchType_idx" ON "scam_clusters"("matchType");

-- CreateIndex
CREATE INDEX "scam_clusters_status_idx" ON "scam_clusters"("status");

-- CreateIndex
CREATE INDEX "scam_signals_clusterId_idx" ON "scam_signals"("clusterId");

-- AddForeignKey
ALTER TABLE "scam_signals" ADD CONSTRAINT "scam_signals_clusterId_fkey" FOREIGN KEY ("clusterId") REFERENCES "scam_clusters"("id") ON DELETE SET NULL ON UPDATE CASCADE;
