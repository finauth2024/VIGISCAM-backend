-- VIGISCAM Backend — Phase 9F: ScamMirror™.
-- Safe simulation environment. The user role-plays a scam conversation
-- in a sandbox; the system captures tactics + phrases for ScamScript
-- Genome learning. Hard rule: the input sanitizer rejects real bank
-- credentials, crypto private keys, mnemonic phrases, and SSNs. If a
-- real credential slips through, the session is force-ended with status
-- ABORTED_REAL_CREDS and a Guardian Pause is pulled (the user just
-- demonstrated they're at live risk of leaking those secrets).

CREATE TYPE "ScamMirrorPersona" AS ENUM (
  'TECH_SUPPORT',
  'BANK_IMPERSONATION',
  'ROMANCE',
  'GOVERNMENT',
  'INVESTMENT',
  'INHERITANCE',
  'EMPLOYER',
  'OTHER'
);

CREATE TYPE "ScamMirrorStatus" AS ENUM (
  'ACTIVE',
  'ENDED_LEARNED',
  'ENDED_ABANDONED',
  'ABORTED_REAL_CREDS'
);

CREATE TABLE "scammirror_sessions" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tenantId" UUID,
    "persona" "ScamMirrorPersona" NOT NULL,
    "scenario" TEXT NOT NULL,
    -- Array of {turn, role, text, tacticsDetected: string[], at}.
    "turns" JSONB NOT NULL DEFAULT '[]'::jsonb,
    -- Cumulative tactic set observed across turns.
    "tacticsObserved" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "status" "ScamMirrorStatus" NOT NULL DEFAULT 'ACTIVE',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "endReason" TEXT,
    "guardianPauseEventId" UUID,
    "evidenceEventId" UUID,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scammirror_sessions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "scammirror_sessions_userId_idx" ON "scammirror_sessions"("userId");
CREATE INDEX "scammirror_sessions_tenantId_idx" ON "scammirror_sessions"("tenantId");
CREATE INDEX "scammirror_sessions_status_idx" ON "scammirror_sessions"("status");
CREATE INDEX "scammirror_sessions_userId_startedAt_idx" ON "scammirror_sessions"("userId", "startedAt");

ALTER TABLE "scammirror_sessions" ADD CONSTRAINT "scammirror_sessions_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "scammirror_sessions" ADD CONSTRAINT "scammirror_sessions_guardianPauseEventId_fkey"
  FOREIGN KEY ("guardianPauseEventId") REFERENCES "pause_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "scammirror_sessions" ADD CONSTRAINT "scammirror_sessions_evidenceEventId_fkey"
  FOREIGN KEY ("evidenceEventId") REFERENCES "evidence_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;
