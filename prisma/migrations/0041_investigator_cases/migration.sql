-- Phase 10D — Investigator console.
--
-- Four tables for investigator-tenant case workspaces:
--   1. investigator_cases — the case header.
--   2. investigator_case_evidence — links a case to evidence events.
--   3. investigator_case_clusters — links a case to ScamCluster IDs.
--   4. investigator_case_notes — append-only notes timeline.
--
-- Cross-tenant by design: an investigator may link evidence events
-- from any tenant. The link itself is the audit (and every link writes
-- to the chain of custody). Whether the investigator can READ the
-- linked entity's content is a separate ABAC concern that lands in
-- Phase 10F.
--
-- A case is "soft" deletable only — we never hard-delete an open or
-- closed case. The chain-of-custody invariant requires every linked
-- entity to remain referable.

CREATE TABLE "investigator_cases" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "severity" TEXT NOT NULL DEFAULT 'MEDIUM',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "assignedToUserId" UUID,
    "createdByUserId" UUID NOT NULL,
    "closedAt" TIMESTAMP(3),
    "disposition" TEXT,
    "metadata" JSONB,
    "evidenceEventId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "investigator_cases_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "investigator_cases_tenantId_idx" ON "investigator_cases"("tenantId");
CREATE INDEX "investigator_cases_status_idx" ON "investigator_cases"("status");
CREATE INDEX "investigator_cases_severity_idx" ON "investigator_cases"("severity");
CREATE INDEX "investigator_cases_assignedToUserId_idx" ON "investigator_cases"("assignedToUserId");
CREATE INDEX "investigator_cases_createdAt_idx" ON "investigator_cases"("createdAt");

CREATE TABLE "investigator_case_evidence" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "caseId" UUID NOT NULL,
    "evidenceEventId" UUID NOT NULL,
    "linkedByUserId" UUID NOT NULL,
    "rationale" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "investigator_case_evidence_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "investigator_case_evidence_unique" UNIQUE ("caseId", "evidenceEventId")
);
CREATE INDEX "investigator_case_evidence_caseId_idx" ON "investigator_case_evidence"("caseId");
CREATE INDEX "investigator_case_evidence_evidenceEventId_idx" ON "investigator_case_evidence"("evidenceEventId");

ALTER TABLE "investigator_case_evidence"
    ADD CONSTRAINT "investigator_case_evidence_case_fkey"
    FOREIGN KEY ("caseId") REFERENCES "investigator_cases"("id") ON DELETE CASCADE;

CREATE TABLE "investigator_case_clusters" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "caseId" UUID NOT NULL,
    "clusterId" UUID NOT NULL,
    "linkedByUserId" UUID NOT NULL,
    "rationale" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "investigator_case_clusters_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "investigator_case_clusters_unique" UNIQUE ("caseId", "clusterId")
);
CREATE INDEX "investigator_case_clusters_caseId_idx" ON "investigator_case_clusters"("caseId");
CREATE INDEX "investigator_case_clusters_clusterId_idx" ON "investigator_case_clusters"("clusterId");

ALTER TABLE "investigator_case_clusters"
    ADD CONSTRAINT "investigator_case_clusters_case_fkey"
    FOREIGN KEY ("caseId") REFERENCES "investigator_cases"("id") ON DELETE CASCADE;

CREATE TABLE "investigator_case_notes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "caseId" UUID NOT NULL,
    "authorUserId" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "evidenceEventId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "investigator_case_notes_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "investigator_case_notes_caseId_idx" ON "investigator_case_notes"("caseId");
CREATE INDEX "investigator_case_notes_createdAt_idx" ON "investigator_case_notes"("createdAt");

ALTER TABLE "investigator_case_notes"
    ADD CONSTRAINT "investigator_case_notes_case_fkey"
    FOREIGN KEY ("caseId") REFERENCES "investigator_cases"("id") ON DELETE CASCADE;
