-- VIGISCAM Backend — Phase 5A migration: partner API keys (tenant-scoped auth).

-- CreateEnum
CREATE TYPE "PartnerApiKeyScope" AS ENUM ('REPORT_SUBMIT', 'READ_TENANT_INTEL', 'EVIDENCE_EXPORT', 'WEBHOOK_MANAGE');

-- CreateEnum
CREATE TYPE "PartnerApiKeyStatus" AS ENUM ('ACTIVE', 'REVOKED', 'EXPIRED');

-- CreateTable
CREATE TABLE "partner_api_keys" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "keyHash" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "scopes" "PartnerApiKeyScope"[],
    "status" "PartnerApiKeyStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdByUserId" UUID,
    "expiresAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partner_api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "partner_api_keys_keyHash_key" ON "partner_api_keys"("keyHash");

-- CreateIndex
CREATE INDEX "partner_api_keys_tenantId_idx" ON "partner_api_keys"("tenantId");

-- CreateIndex
CREATE INDEX "partner_api_keys_status_idx" ON "partner_api_keys"("status");

-- AddForeignKey
ALTER TABLE "partner_api_keys" ADD CONSTRAINT "partner_api_keys_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
