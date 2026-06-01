-- VIGISCAM Backend — Phase 9H: trusted-contact review workflow.
-- Wires the ESCALATED_TO_TRUSTED_CONTACT outcomes that 9B/9C/9D/9E
-- produce into a real review→decision flow. A protection event (e.g.
-- ScamHold or ClaimVerify) opens a review row pointing at one of the
-- user's trusted contacts; the contact records a decision; the
-- decision feeds back into the triggering module's history view.

CREATE TYPE "TrustedContactReviewTriggerModule" AS ENUM (
  'GUARDIAN_PAUSE',
  'SCAMHOLD',
  'GIFTCARDGUARD',
  'WALLETGUARD',
  'CLAIMVERIFY',
  'SCAMMIRROR'
);

CREATE TYPE "TrustedContactReviewStatus" AS ENUM (
  'PENDING',
  'DECIDED',
  'EXPIRED',
  'CANCELLED'
);

CREATE TYPE "TrustedContactReviewDecision" AS ENUM (
  'APPROVE_AFTER_VERIFICATION',
  'REJECT_HIGH_RISK',
  'NEED_MORE_INFORMATION',
  'CALL_USER_IMMEDIATELY',
  'ESCALATE_TO_BANK_OR_AGENCY'
);

CREATE TABLE "trusted_contact_reviews" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tenantId" UUID,
    "contactId" UUID NOT NULL,
    "triggerModule" "TrustedContactReviewTriggerModule" NOT NULL,
    "triggerEventId" UUID NOT NULL,
    "triggerSummary" TEXT NOT NULL,
    "status" "TrustedContactReviewStatus" NOT NULL DEFAULT 'PENDING',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    "decision" "TrustedContactReviewDecision",
    "decisionNotes" TEXT,
    "decidedByContactToken" TEXT,
    "evidenceEventId" UUID,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trusted_contact_reviews_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "trusted_contact_reviews_userId_idx" ON "trusted_contact_reviews"("userId");
CREATE INDEX "trusted_contact_reviews_tenantId_idx" ON "trusted_contact_reviews"("tenantId");
CREATE INDEX "trusted_contact_reviews_contactId_idx" ON "trusted_contact_reviews"("contactId");
CREATE INDEX "trusted_contact_reviews_status_idx" ON "trusted_contact_reviews"("status");
CREATE INDEX "trusted_contact_reviews_triggerModule_triggerEventId_idx" ON "trusted_contact_reviews"("triggerModule", "triggerEventId");

ALTER TABLE "trusted_contact_reviews" ADD CONSTRAINT "trusted_contact_reviews_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "trusted_contact_reviews" ADD CONSTRAINT "trusted_contact_reviews_contactId_fkey"
  FOREIGN KEY ("contactId") REFERENCES "trusted_contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "trusted_contact_reviews" ADD CONSTRAINT "trusted_contact_reviews_evidenceEventId_fkey"
  FOREIGN KEY ("evidenceEventId") REFERENCES "evidence_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;
