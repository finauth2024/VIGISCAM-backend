-- CP-9 — full notification delivery tracking (reviewer #10).
ALTER TABLE "notification_deliveries"
  ADD COLUMN "readAt" TIMESTAMP(3),
  ADD COLUMN "relatedRiskEventId" UUID,
  ADD COLUMN "relatedEvidenceId" UUID;

CREATE INDEX "notification_deliveries_relatedRiskEventId_idx"
  ON "notification_deliveries"("relatedRiskEventId");
