-- VIGISCAM Backend — Phase 5E migration: partner evidence export bundles.

-- CreateEnum
CREATE TYPE "EvidenceExportBundleStatus" AS ENUM ('READY', 'EXPIRED');

-- CreateTable
CREATE TABLE "evidence_export_bundles" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "requestedByKeyId" UUID,
    "filters" JSONB NOT NULL,
    "recordCount" INTEGER NOT NULL,
    "checksum" TEXT NOT NULL,
    "bundle" JSONB NOT NULL,
    "status" "EvidenceExportBundleStatus" NOT NULL DEFAULT 'READY',
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evidence_export_bundles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "evidence_export_bundles_tenantId_idx" ON "evidence_export_bundles"("tenantId");

-- CreateIndex
CREATE INDEX "evidence_export_bundles_status_idx" ON "evidence_export_bundles"("status");

-- AddForeignKey
ALTER TABLE "evidence_export_bundles" ADD CONSTRAINT "evidence_export_bundles_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
