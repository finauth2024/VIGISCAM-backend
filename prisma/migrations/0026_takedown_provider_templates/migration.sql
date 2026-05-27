-- VIGISCAM Backend — Phase 7D migration: provider templates for automation.

-- CreateTable
CREATE TABLE "takedown_provider_templates" (
    "id" UUID NOT NULL,
    "providerType" "TakedownProviderType" NOT NULL,
    "providerName" TEXT NOT NULL,
    "detectorPattern" TEXT NOT NULL,
    "abuseContact" TEXT,
    "detailsTemplate" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "takedown_provider_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "takedown_provider_templates_enabled_idx" ON "takedown_provider_templates"("enabled");

-- CreateIndex
CREATE UNIQUE INDEX "takedown_provider_templates_providerType_providerName_key" ON "takedown_provider_templates"("providerType", "providerName");

-- ───── Seed: a few well-known registrars so the automation works out of the box.
INSERT INTO "takedown_provider_templates"
  ("id", "providerType", "providerName", "detectorPattern", "abuseContact", "detailsTemplate", "enabled", "priority", "updatedAt") VALUES
  (gen_random_uuid(), 'DOMAIN_REGISTRAR', 'GoDaddy',     '(?i)godaddy',     'abuse@godaddy.com',  'Auto-drafted takedown request for {indicator} ({category}). Verified scam intelligence: {summary}', true, 10, NOW()),
  (gen_random_uuid(), 'DOMAIN_REGISTRAR', 'Namecheap',   '(?i)namecheap',   'abuse@namecheap.com','Auto-drafted takedown request for {indicator} ({category}). Verified scam intelligence: {summary}', true, 10, NOW()),
  (gen_random_uuid(), 'DOMAIN_REGISTRAR', 'Cloudflare',  '(?i)cloudflare',  'abuse@cloudflare.com','Auto-drafted takedown request for {indicator} ({category}). Verified scam intelligence: {summary}', true, 10, NOW()),
  (gen_random_uuid(), 'DOMAIN_REGISTRAR', 'Tucows',      '(?i)tucows',      'abuse@tucows.com',   'Auto-drafted takedown request for {indicator} ({category}). Verified scam intelligence: {summary}', true, 10, NOW()),
  (gen_random_uuid(), 'DOMAIN_REGISTRAR', 'Porkbun',     '(?i)porkbun',     'abuse@porkbun.com',  'Auto-drafted takedown request for {indicator} ({category}). Verified scam intelligence: {summary}', true, 10, NOW()),
  (gen_random_uuid(), 'DOMAIN_REGISTRAR', 'Gandi',       '(?i)gandi',       'abuse@gandi.net',    'Auto-drafted takedown request for {indicator} ({category}). Verified scam intelligence: {summary}', true, 10, NOW())
ON CONFLICT ("providerType", "providerName") DO NOTHING;
