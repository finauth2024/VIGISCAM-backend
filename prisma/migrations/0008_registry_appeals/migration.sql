-- VIGISCAM Backend — Phase 3C migration: registry corrections & appeals.

-- CreateEnum
CREATE TYPE "RegistryAppealType" AS ENUM ('CORRECTION', 'REMOVAL', 'OWNERSHIP_DISPUTE');

-- CreateEnum
CREATE TYPE "RegistryAppealStatus" AS ENUM ('SUBMITTED', 'UNDER_REVIEW', 'ACCEPTED', 'REJECTED');

-- CreateTable
CREATE TABLE "registry_appeals" (
    "id" UUID NOT NULL,
    "registryEntryId" UUID NOT NULL,
    "appealType" "RegistryAppealType" NOT NULL,
    "status" "RegistryAppealStatus" NOT NULL DEFAULT 'SUBMITTED',
    "submitterName" TEXT NOT NULL,
    "submitterEmail" TEXT NOT NULL,
    "submitterRelationship" TEXT,
    "reason" TEXT NOT NULL,
    "requestedChange" TEXT,
    "reviewedByUserId" UUID,
    "reviewedAt" TIMESTAMP(3),
    "reviewNotes" TEXT,
    "resolutionAction" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "registry_appeals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "registry_appeals_registryEntryId_idx" ON "registry_appeals"("registryEntryId");

-- CreateIndex
CREATE INDEX "registry_appeals_status_idx" ON "registry_appeals"("status");

-- AddForeignKey
ALTER TABLE "registry_appeals" ADD CONSTRAINT "registry_appeals_registryEntryId_fkey" FOREIGN KEY ("registryEntryId") REFERENCES "registry_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
