-- Phase 11A follow-up — decouple the consumer subscription plan from the
-- partner-API quota enum and rename to the real product line.
--
-- tenant_subscriptions.plan was the shared PartnerApiKeyPlan enum
-- (FREE/PRO/ENTERPRISE). It becomes a free-form TEXT column holding the
-- billing plan codes (FREE / BASIC / FAMILY_GUARDIAN / PREMIUM_SHIELD),
-- validated at the app layer against the plan registry. The PartnerApiKeyPlan
-- enum itself is unchanged (it still governs partner-key quota).
--
-- Existing values are remapped: any legacy PRO -> BASIC, ENTERPRISE ->
-- PREMIUM_SHIELD; FREE stays FREE. (Dev has effectively only FREE/no rows.)

ALTER TABLE "tenant_subscriptions" ALTER COLUMN "plan" DROP DEFAULT;

ALTER TABLE "tenant_subscriptions"
  ALTER COLUMN "plan" TYPE TEXT USING (
    CASE "plan"::text
      WHEN 'PRO' THEN 'BASIC'
      WHEN 'ENTERPRISE' THEN 'PREMIUM_SHIELD'
      ELSE "plan"::text
    END
  );

ALTER TABLE "tenant_subscriptions" ALTER COLUMN "plan" SET DEFAULT 'FREE';
