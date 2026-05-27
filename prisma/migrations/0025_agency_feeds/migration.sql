-- VIGISCAM Backend — Phase 7C migration: cross-border agency feeds.

-- CreateEnum
CREATE TYPE "AgencyFeedStatus" AS ENUM ('ACTIVE', 'PAUSED', 'REVOKED');

-- AlterEnum (Pg 12+: ADD VALUE works in a transaction as long as the new
-- value isn't referenced before COMMIT. We only add it here; nothing in
-- this migration uses AGENCY_FEED.)
ALTER TYPE "PartnerApiKeyScope" ADD VALUE 'AGENCY_FEED';

-- CreateTable
CREATE TABLE "agency_feeds" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "region" TEXT,
    "categories" TEXT[],
    "indicatorTypes" "IndicatorType"[],
    "status" "AgencyFeedStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdByUserId" UUID,
    "lastDeliveredAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agency_feeds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agency_feed_deliveries" (
    "id" UUID NOT NULL,
    "feedId" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "requestedByKeyId" UUID,
    "itemCount" INTEGER NOT NULL,
    "sinceCursor" TIMESTAMP(3),
    "untilCursor" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agency_feed_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "agency_feeds_tenantId_idx" ON "agency_feeds"("tenantId");
CREATE INDEX "agency_feeds_status_idx" ON "agency_feeds"("status");
CREATE INDEX "agency_feeds_region_idx" ON "agency_feeds"("region");
CREATE INDEX "agency_feed_deliveries_feedId_idx" ON "agency_feed_deliveries"("feedId");
CREATE INDEX "agency_feed_deliveries_tenantId_idx" ON "agency_feed_deliveries"("tenantId");

-- AddForeignKey
ALTER TABLE "agency_feeds" ADD CONSTRAINT "agency_feeds_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agency_feed_deliveries" ADD CONSTRAINT "agency_feed_deliveries_feedId_fkey" FOREIGN KEY ("feedId") REFERENCES "agency_feeds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
