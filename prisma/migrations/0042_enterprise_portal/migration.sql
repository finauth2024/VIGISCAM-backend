-- Phase 10E — Enterprise admin backend.
--
-- Two tables for enterprise-tenant admin self-service:
--   1. enterprise_policies — key/value policy store with a closed
--      registry of policy keys enforced at the DTO layer (not the DB)
--      so the registry can evolve without an enum migration each time.
--   2. enterprise_integrations — third-party integrations the
--      enterprise has registered (SIEM webhooks, Slack workspace, etc.)
--
-- Device fleet view and audit log read use the existing devices /
-- evidence_events tables — no new migration needed for those reads.
--
-- Billing surface is read-only until Phase 11A (Stripe). The endpoint
-- returns a stub describing the current plan label and "billing
-- portal not yet active" until the Stripe customer is provisioned.

CREATE TABLE "enterprise_policies" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedByUserId" UUID NOT NULL,
    "evidenceEventId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "enterprise_policies_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "enterprise_policies_tenant_key_unique" UNIQUE ("tenantId", "key")
);
CREATE INDEX "enterprise_policies_tenantId_idx" ON "enterprise_policies"("tenantId");

CREATE TABLE "enterprise_integrations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdByUserId" UUID NOT NULL,
    "evidenceEventId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "enterprise_integrations_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "enterprise_integrations_tenantId_idx" ON "enterprise_integrations"("tenantId");
CREATE INDEX "enterprise_integrations_kind_idx" ON "enterprise_integrations"("kind");
CREATE INDEX "enterprise_integrations_status_idx" ON "enterprise_integrations"("status");
