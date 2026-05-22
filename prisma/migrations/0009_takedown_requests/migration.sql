-- VIGISCAM Backend — Phase 3D migration: takedown request tracking.

-- CreateEnum
CREATE TYPE "TakedownProviderType" AS ENUM ('DOMAIN_REGISTRAR', 'HOSTING_PROVIDER', 'TELECOM_CARRIER', 'EMAIL_PROVIDER', 'SOCIAL_PLATFORM', 'PAYMENT_PROVIDER', 'APP_STORE', 'LAW_ENFORCEMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "TakedownStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'ACKNOWLEDGED', 'IN_PROGRESS', 'COMPLETED', 'REJECTED', 'WITHDRAWN');

-- CreateTable
CREATE TABLE "takedown_requests" (
    "id" UUID NOT NULL,
    "registryEntryId" UUID NOT NULL,
    "providerType" "TakedownProviderType" NOT NULL,
    "providerName" TEXT NOT NULL,
    "providerReference" TEXT,
    "status" "TakedownStatus" NOT NULL DEFAULT 'DRAFT',
    "details" TEXT NOT NULL,
    "submittedByUserId" UUID,
    "submittedAt" TIMESTAMP(3),
    "resolvedByUserId" UUID,
    "resolvedAt" TIMESTAMP(3),
    "outcomeNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "takedown_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "takedown_requests_registryEntryId_idx" ON "takedown_requests"("registryEntryId");

-- CreateIndex
CREATE INDEX "takedown_requests_status_idx" ON "takedown_requests"("status");

-- AddForeignKey
ALTER TABLE "takedown_requests" ADD CONSTRAINT "takedown_requests_registryEntryId_fkey" FOREIGN KEY ("registryEntryId") REFERENCES "registry_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
