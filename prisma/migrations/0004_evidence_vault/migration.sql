-- VIGISCAM Backend — Phase 1C migration: Evidence Vault (hash-chained events).

-- CreateTable
CREATE TABLE "evidence_events" (
    "id" UUID NOT NULL,
    "tenantId" UUID,
    "sequence" INTEGER NOT NULL,
    "actorId" UUID,
    "actorType" TEXT,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "eventDescription" TEXT NOT NULL,
    "metadata" JSONB,
    "ipAddress" TEXT,
    "deviceId" TEXT,
    "previousHash" TEXT,
    "eventHash" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evidence_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "evidence_events_tenantId_idx" ON "evidence_events"("tenantId");

-- CreateIndex
CREATE INDEX "evidence_events_entityType_entityId_idx" ON "evidence_events"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "evidence_events_eventType_idx" ON "evidence_events"("eventType");

-- CreateIndex
CREATE UNIQUE INDEX "evidence_events_tenantId_sequence_key" ON "evidence_events"("tenantId", "sequence");
