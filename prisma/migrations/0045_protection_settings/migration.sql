-- CP-1 — UserProfile + ProtectionSettings + Elder Mode policy knobs.
-- Foundational for trusted-contact / elder-mode enforcement (brief pp.58-60).

-- Elder/vulnerable flag on the user.
ALTER TABLE "users" ADD COLUMN "elderModeEnabled" BOOLEAN NOT NULL DEFAULT false;

-- Protection level for accessibility / strength.
CREATE TYPE "ProtectionLevel" AS ENUM ('STANDARD', 'ELEVATED', 'ELDER', 'MAXIMUM');

-- Per-user protection preferences / accessibility context.
CREATE TABLE "user_profiles" (
  "id"                       UUID NOT NULL,
  "userId"                   UUID NOT NULL,
  "ageGroup"                 TEXT,
  "preferredLanguage"        TEXT NOT NULL DEFAULT 'en',
  "country"                  TEXT,
  "timezone"                 TEXT,
  "protectionLevel"          "ProtectionLevel" NOT NULL DEFAULT 'STANDARD',
  "defaultTrustedContactId"  UUID,
  "voiceWarningEnabled"      BOOLEAN NOT NULL DEFAULT false,
  "largeTextWarningEnabled"  BOOLEAN NOT NULL DEFAULT false,
  "accessibilityModeEnabled" BOOLEAN NOT NULL DEFAULT false,
  "createdAt"                TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"                TIMESTAMP(3) NOT NULL,
  CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "user_profiles_userId_key" ON "user_profiles"("userId");
ALTER TABLE "user_profiles"
  ADD CONSTRAINT "user_profiles_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Module-level settings + elder/trusted-contact policy knobs.
CREATE TABLE "protection_settings" (
  "id"                           UUID NOT NULL,
  "userId"                       UUID NOT NULL,
  "scamHoldEnabled"              BOOLEAN NOT NULL DEFAULT true,
  "guardianPauseEnabled"         BOOLEAN NOT NULL DEFAULT true,
  "giftCardGuardEnabled"         BOOLEAN NOT NULL DEFAULT true,
  "walletGuardEnabled"           BOOLEAN NOT NULL DEFAULT true,
  "claimVerifyEnabled"           BOOLEAN NOT NULL DEFAULT true,
  "scamMirrorEnabled"            BOOLEAN NOT NULL DEFAULT true,
  "identityGraphEnabled"         BOOLEAN NOT NULL DEFAULT true,
  "evidenceAutoSaveEnabled"      BOOLEAN NOT NULL DEFAULT true,
  "trustedContactRequired"       BOOLEAN NOT NULL DEFAULT false,
  "elderModeStrictLock"          BOOLEAN NOT NULL DEFAULT false,
  "allowContinueAnyway"          BOOLEAN NOT NULL DEFAULT true,
  "highRiskAmountThresholdMinor" BIGINT NOT NULL DEFAULT 100000,
  "guardianPauseDurationSeconds" INTEGER NOT NULL DEFAULT 30,
  "createdAt"                    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"                    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "protection_settings_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "protection_settings_userId_key" ON "protection_settings"("userId");
ALTER TABLE "protection_settings"
  ADD CONSTRAINT "protection_settings_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
