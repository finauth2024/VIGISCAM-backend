-- VIGISCAM Backend — Phase 6C migration: Identity Collision Graph.

-- CreateEnum
CREATE TYPE "FraudGraphNodeType" AS ENUM ('INDICATOR', 'CAMPAIGN', 'ACTOR');

-- CreateEnum
CREATE TYPE "FraudGraphEdgeType" AS ENUM ('CO_OCCURRENCE_CLUSTER', 'SIMILAR_TEXT', 'SHARED_CATEGORY');

-- CreateTable
CREATE TABLE "fraud_graph_nodes" (
    "id" UUID NOT NULL,
    "nodeType" "FraudGraphNodeType" NOT NULL DEFAULT 'INDICATOR',
    "indicatorType" "IndicatorType",
    "normalizedIndicator" TEXT,
    "label" TEXT NOT NULL,
    "category" TEXT,
    "signalCount" INTEGER NOT NULL DEFAULT 0,
    "riskScore" INTEGER NOT NULL DEFAULT 0,
    "firstSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fraud_graph_nodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fraud_graph_edges" (
    "id" UUID NOT NULL,
    "sourceNodeId" UUID NOT NULL,
    "targetNodeId" UUID NOT NULL,
    "edgeType" "FraudGraphEdgeType" NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "evidenceCount" INTEGER NOT NULL DEFAULT 1,
    "firstSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fraud_graph_edges_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fraud_graph_nodes_nodeType_idx" ON "fraud_graph_nodes"("nodeType");

-- CreateIndex
CREATE INDEX "fraud_graph_nodes_category_idx" ON "fraud_graph_nodes"("category");

-- CreateIndex
CREATE INDEX "fraud_graph_nodes_riskScore_idx" ON "fraud_graph_nodes"("riskScore");

-- CreateIndex
CREATE UNIQUE INDEX "fraud_graph_nodes_indicatorType_normalizedIndicator_key" ON "fraud_graph_nodes"("indicatorType", "normalizedIndicator");

-- CreateIndex
CREATE INDEX "fraud_graph_edges_sourceNodeId_idx" ON "fraud_graph_edges"("sourceNodeId");

-- CreateIndex
CREATE INDEX "fraud_graph_edges_targetNodeId_idx" ON "fraud_graph_edges"("targetNodeId");

-- CreateIndex
CREATE INDEX "fraud_graph_edges_edgeType_idx" ON "fraud_graph_edges"("edgeType");

-- CreateIndex
CREATE UNIQUE INDEX "fraud_graph_edges_sourceNodeId_targetNodeId_edgeType_key" ON "fraud_graph_edges"("sourceNodeId", "targetNodeId", "edgeType");

-- AddForeignKey
ALTER TABLE "fraud_graph_edges" ADD CONSTRAINT "fraud_graph_edges_sourceNodeId_fkey" FOREIGN KEY ("sourceNodeId") REFERENCES "fraud_graph_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fraud_graph_edges" ADD CONSTRAINT "fraud_graph_edges_targetNodeId_fkey" FOREIGN KEY ("targetNodeId") REFERENCES "fraud_graph_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
