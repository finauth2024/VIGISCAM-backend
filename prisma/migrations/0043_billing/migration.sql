-- Phase 11A — Stripe billing.
--
-- Extends (does not duplicate) the Phase 7E plan model. The plan tier
-- enum (FREE/PRO/ENTERPRISE) is the same PartnerApiKeyPlan already in
-- the schema; a tenant's *subscription* now drives that tier at the
-- tenant level, while partner API keys keep their own per-key plan for
-- machine-to-machine quota.
--
--   1. tenant_subscriptions — one row per tenant: the Stripe customer +
--      subscription linkage, current plan, status, period end, and a
--      manual-invoice flag for enterprise contract billing (no card).
--   2. billing_events — idempotency + audit log of every Stripe webhook
--      we processed, keyed on the Stripe event id so a redelivery is a
--      no-op.

CREATE TABLE "tenant_subscriptions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "plan" "PartnerApiKeyPlan" NOT NULL DEFAULT 'FREE',
    "status" TEXT NOT NULL DEFAULT 'INACTIVE',
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "stripePriceId" TEXT,
    "currentPeriodEnd" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "manualInvoice" BOOLEAN NOT NULL DEFAULT false,
    "evidenceEventId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "tenant_subscriptions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "tenant_subscriptions_tenantId_key" UNIQUE ("tenantId")
);
CREATE INDEX "tenant_subscriptions_stripeCustomerId_idx" ON "tenant_subscriptions"("stripeCustomerId");
CREATE INDEX "tenant_subscriptions_stripeSubscriptionId_idx" ON "tenant_subscriptions"("stripeSubscriptionId");
CREATE INDEX "tenant_subscriptions_status_idx" ON "tenant_subscriptions"("status");

ALTER TABLE "tenant_subscriptions"
    ADD CONSTRAINT "tenant_subscriptions_tenant_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE;

CREATE TABLE "billing_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "stripeEventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "tenantId" UUID,
    "payload" JSONB,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "billing_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "billing_events_stripeEventId_key" UNIQUE ("stripeEventId")
);
CREATE INDEX "billing_events_type_idx" ON "billing_events"("type");
CREATE INDEX "billing_events_tenantId_idx" ON "billing_events"("tenantId");
