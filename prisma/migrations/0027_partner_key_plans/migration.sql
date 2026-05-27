-- VIGISCAM Backend — Phase 7E migration: commercial plan tiers + daily usage.

-- CreateEnum
CREATE TYPE "PartnerApiKeyPlan" AS ENUM ('FREE', 'PRO', 'ENTERPRISE');

-- AlterTable
ALTER TABLE "partner_api_keys" ADD COLUMN     "plan" "PartnerApiKeyPlan" NOT NULL DEFAULT 'FREE';

-- CreateTable
CREATE TABLE "partner_api_key_usage" (
    "id" UUID NOT NULL,
    "keyId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "requestCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partner_api_key_usage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "partner_api_key_usage_keyId_idx" ON "partner_api_key_usage"("keyId");
CREATE INDEX "partner_api_key_usage_date_idx" ON "partner_api_key_usage"("date");
CREATE UNIQUE INDEX "partner_api_key_usage_keyId_date_key" ON "partner_api_key_usage"("keyId", "date");

-- AddForeignKey
ALTER TABLE "partner_api_key_usage" ADD CONSTRAINT "partner_api_key_usage_keyId_fkey" FOREIGN KEY ("keyId") REFERENCES "partner_api_keys"("id") ON DELETE CASCADE ON UPDATE CASCADE;
