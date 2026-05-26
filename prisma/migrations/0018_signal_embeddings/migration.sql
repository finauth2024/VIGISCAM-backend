-- VIGISCAM Backend — Phase 6B migration: signal embeddings + similarity.

-- CreateTable
CREATE TABLE "signal_embeddings" (
    "id" UUID NOT NULL,
    "signalId" UUID NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "source" "AIDecisionSource" NOT NULL DEFAULT 'STUB',
    "vector" DOUBLE PRECISION[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "signal_embeddings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "signal_similarities" (
    "id" UUID NOT NULL,
    "signalAId" UUID NOT NULL,
    "signalBId" UUID NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "signal_similarities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "signal_embeddings_signalId_key" ON "signal_embeddings"("signalId");

-- CreateIndex
CREATE INDEX "signal_embeddings_modelVersion_idx" ON "signal_embeddings"("modelVersion");

-- CreateIndex
CREATE INDEX "signal_similarities_signalAId_idx" ON "signal_similarities"("signalAId");

-- CreateIndex
CREATE INDEX "signal_similarities_signalBId_idx" ON "signal_similarities"("signalBId");

-- CreateIndex
CREATE INDEX "signal_similarities_score_idx" ON "signal_similarities"("score");

-- CreateIndex
CREATE UNIQUE INDEX "signal_similarities_signalAId_signalBId_modelVersion_key" ON "signal_similarities"("signalAId", "signalBId", "modelVersion");

-- AddForeignKey
ALTER TABLE "signal_embeddings" ADD CONSTRAINT "signal_embeddings_signalId_fkey" FOREIGN KEY ("signalId") REFERENCES "scam_signals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signal_similarities" ADD CONSTRAINT "signal_similarities_signalAId_fkey" FOREIGN KEY ("signalAId") REFERENCES "scam_signals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signal_similarities" ADD CONSTRAINT "signal_similarities_signalBId_fkey" FOREIGN KEY ("signalBId") REFERENCES "scam_signals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
