import { RegistryEntry, RegistryPublicStatus, RiskLevel } from '@prisma/client';
import { levelForScore } from '../risk-fusion/risk.scoring';

/**
 * The public-safe shape of a registry entry. This is an explicit allowlist —
 * internal fields (normalizedIndicator, raw confidenceScore, internal lifecycle
 * status, source signal id, approver id, timestamps) are deliberately NOT
 * included, so private intelligence cannot leak through the public registry
 * (PDF §26, §38, docs/04). The only status exposed is `publicStatus` — the
 * approved, status-based public vocabulary.
 */
export interface PublicRegistryEntry {
  id: string;
  indicatorType: string;
  indicator: string;
  category: string;
  publicStatus: RegistryPublicStatus | null;
  riskLevel: RiskLevel;
  summary: string;
  recommendedAction: string | null;
  firstSeen: Date | null;
  lastSeen: Date | null;
  evidenceCount: number;
  publishedAt: Date | null;
}

/** Project a stored registry entry down to its public-safe fields only. */
export function toPublicRegistryEntry(entry: RegistryEntry): PublicRegistryEntry {
  return {
    id: entry.id,
    indicatorType: entry.indicatorType,
    indicator: entry.indicatorValue,
    category: entry.category,
    publicStatus: entry.publicStatus,
    riskLevel: levelForScore(entry.confidenceScore),
    summary: entry.publicSafeSummary,
    recommendedAction: entry.recommendedAction,
    firstSeen: entry.firstSeen,
    lastSeen: entry.lastSeen,
    evidenceCount: entry.evidenceCount,
    publishedAt: entry.publishedAt,
  };
}
