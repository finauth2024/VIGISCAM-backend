-- VIGISCAM Backend — Phase 10A: Evidence Vault file storage.
-- A row per uploaded file attached to an evidence event. File bytes
-- live in Azure Blob (Phase 8D); this table is the discovery + audit
-- surface (sha256 for tamper detection, retention deadline, legal-hold
-- flag). Bundle export + signed-URL share + redacted public-safe view
-- all read from here.

CREATE TABLE "evidence_files" (
    "id" UUID NOT NULL,
    "evidenceEventId" UUID NOT NULL,
    "tenantId" UUID,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "sha256" TEXT NOT NULL,
    "blobUri" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "retentionUntil" TIMESTAMP(3),
    "legalHold" BOOLEAN NOT NULL DEFAULT false,
    "uploadedByUserId" UUID,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "evidence_files_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "evidence_files_evidenceEventId_idx" ON "evidence_files"("evidenceEventId");
CREATE INDEX "evidence_files_tenantId_idx" ON "evidence_files"("tenantId");
CREATE INDEX "evidence_files_sha256_idx" ON "evidence_files"("sha256");
CREATE INDEX "evidence_files_legalHold_idx" ON "evidence_files"("legalHold");

ALTER TABLE "evidence_files" ADD CONSTRAINT "evidence_files_evidenceEventId_fkey"
  FOREIGN KEY ("evidenceEventId") REFERENCES "evidence_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
