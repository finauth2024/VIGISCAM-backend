-- VIGISCAM Backend — Phase 9G: Identity Collision Graph™ upgrade.
-- Extends the existing fraud-graph (Phase 6C + 7B) with the seven new
-- node types and seven new edge types specified in the brief, and adds
-- a `displayMask` column so sensitive nodes (PHONE, EMAIL, PROFILE,
-- FACE_SIGNAL, VOICE_SIGNAL) can carry a redacted public-safe value
-- alongside the raw normalizedIndicator.

ALTER TYPE "FraudGraphNodeType" ADD VALUE IF NOT EXISTS 'PROFILE';
ALTER TYPE "FraudGraphNodeType" ADD VALUE IF NOT EXISTS 'FACE_SIGNAL';
ALTER TYPE "FraudGraphNodeType" ADD VALUE IF NOT EXISTS 'VOICE_SIGNAL';
ALTER TYPE "FraudGraphNodeType" ADD VALUE IF NOT EXISTS 'SCRIPT_PATTERN';
ALTER TYPE "FraudGraphNodeType" ADD VALUE IF NOT EXISTS 'PAYMENT_REQUEST';
ALTER TYPE "FraudGraphNodeType" ADD VALUE IF NOT EXISTS 'GIFT_CARD_REQUEST';
ALTER TYPE "FraudGraphNodeType" ADD VALUE IF NOT EXISTS 'IP_RANGE';

ALTER TYPE "FraudGraphEdgeType" ADD VALUE IF NOT EXISTS 'SIMILAR_PROFILE_PHOTO';
ALTER TYPE "FraudGraphEdgeType" ADD VALUE IF NOT EXISTS 'SIMILAR_SCRIPT';
ALTER TYPE "FraudGraphEdgeType" ADD VALUE IF NOT EXISTS 'SAME_PAYMENT_REQUEST';
ALTER TYPE "FraudGraphEdgeType" ADD VALUE IF NOT EXISTS 'HANDLE_CONFUSABILITY';
ALTER TYPE "FraudGraphEdgeType" ADD VALUE IF NOT EXISTS 'VOICE_PATTERN_MATCH';
ALTER TYPE "FraudGraphEdgeType" ADD VALUE IF NOT EXISTS 'FACE_PATTERN_MATCH';
ALTER TYPE "FraudGraphEdgeType" ADD VALUE IF NOT EXISTS 'SHARED_VICTIM_STORY';

ALTER TABLE "fraud_graph_nodes"
  ADD COLUMN IF NOT EXISTS "displayMask" TEXT;
