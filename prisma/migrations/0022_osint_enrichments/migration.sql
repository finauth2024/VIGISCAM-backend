-- VIGISCAM Backend — Phase 6F migration: safe OSINT enrichments.

-- CreateTable
CREATE TABLE "osint_enrichments" (
    "id" UUID NOT NULL,
    "signalId" UUID,
    "indicatorType" "IndicatorType" NOT NULL,
    "normalizedIndicator" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "source" "AIDecisionSource" NOT NULL DEFAULT 'STUB',
    "data" JSONB NOT NULL,
    "riskHints" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "osint_enrichments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "osint_enrichments_signalId_idx" ON "osint_enrichments"("signalId");

-- CreateIndex
CREATE INDEX "osint_enrichments_indicatorType_normalizedIndicator_idx" ON "osint_enrichments"("indicatorType", "normalizedIndicator");

-- CreateIndex
CREATE UNIQUE INDEX "osint_enrichments_indicatorType_normalizedIndicator_provide_key" ON "osint_enrichments"("indicatorType", "normalizedIndicator", "provider");

-- AddForeignKey
ALTER TABLE "osint_enrichments" ADD CONSTRAINT "osint_enrichments_signalId_fkey" FOREIGN KEY ("signalId") REFERENCES "scam_signals"("id") ON DELETE SET NULL ON UPDATE CASCADE;
