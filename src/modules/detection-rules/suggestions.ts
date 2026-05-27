import { DetectionRuleType, RiskLevel, ScamCluster } from '@prisma/client';
import { levelForScore } from '../risk-fusion/risk.scoring';

/**
 * Rule suggestions from verified intelligence (PDF §33). ScamPulse derives
 * detection-rule candidates from clusters of related scam signals. Suggestions
 * always land as DRAFT — the no-auto-activation guardrail is preserved.
 *
 * MVP rule set: a SHARED_DOMAIN_ROOT cluster suggests a domain-root indicator
 * pattern; a SHARED_EMAIL cluster suggests an email-domain pattern. Other
 * cluster types are not auto-suggested yet.
 */

export interface SuggestedRule {
  name: string;
  description: string;
  ruleType: DetectionRuleType;
  pattern: Record<string, unknown>;
  category?: string;
  severity: RiskLevel;
  sourceClusterId: string;
}

export function suggestionForCluster(cluster: ScamCluster): SuggestedRule | null {
  const severity = levelForScore(cluster.confidenceScore);
  const category = cluster.category ?? undefined;
  const count = cluster.signalCount;

  switch (cluster.matchType) {
    case 'SHARED_DOMAIN_ROOT': {
      const root = cluster.clusterKey.replace(/^domain-root:/, '');
      return {
        name: `Domain root pattern — ${root}`,
        description:
          `Auto-suggested from a cluster of ${count} signals sharing the domain root ` +
          `"${root}". Review before activating.`,
        ruleType: 'INDICATOR_PATTERN',
        pattern: { indicatorType: 'DOMAIN', match: 'DOMAIN_ROOT', root },
        category,
        severity,
        sourceClusterId: cluster.id,
      };
    }
    case 'SHARED_EMAIL': {
      const domain = cluster.clusterKey.replace(/^email-domain:/, '');
      return {
        name: `Email domain pattern — ${domain}`,
        description:
          `Auto-suggested from a cluster of ${count} signals sharing the email domain ` +
          `"${domain}". Review before activating.`,
        ruleType: 'INDICATOR_PATTERN',
        pattern: { indicatorType: 'EMAIL', match: 'EMAIL_DOMAIN', domain },
        category,
        severity,
        sourceClusterId: cluster.id,
      };
    }
    default:
      return null;
  }
}

// ─────── Phrase-rule suggestions (Phase 6F) ───────

/** Minimum number of distinct verified signals a tactic must appear in to
 *  qualify for a PHRASE_MATCH suggestion. */
export const MIN_TACTIC_FREQUENCY = 2;

/** Phrases that characterise each manipulation tactic. Aligned with the
 *  patterns the NLP stub looks for (see nlp-stub.ts) so the suggested rule
 *  would actually match the text the AI flagged. */
export const TACTIC_PHRASES: Record<string, string[]> = {
  urgency: ['urgent', 'right now', 'immediately', 'expires today', "act now"],
  secrecy: ["do not tell anyone", 'keep this secret', 'between you and me'],
  'fake-authority': ['official notice', 'court order', 'law enforcement'],
  pressure: ['or else', 'will be arrested', 'final notice', 'final warning'],
};

/** Build a PHRASE_MATCH suggestion for one manipulation tactic. */
export function phraseRuleSuggestion(
  tactic: string,
  frequency: number,
  averageScamScore: number,
): SuggestedRule | null {
  const phrases = TACTIC_PHRASES[tactic];
  if (!phrases || phrases.length === 0) return null;
  return {
    name: `Phrase pattern — ${tactic}`,
    description:
      `Auto-suggested from ${frequency} verified signals whose NLP classifier ` +
      `flagged the "${tactic}" manipulation tactic. Review and refine phrase ` +
      `list before activating.`,
    ruleType: 'PHRASE_MATCH',
    pattern: { tactic, phrases },
    severity: levelForScore(averageScamScore),
    // No source cluster — derived from cross-signal aggregation, not one cluster.
    sourceClusterId: undefined as unknown as string,
  };
}

/** Filter the suggestion shape so the optional sourceClusterId is omitted. */
export interface PhraseSuggestedRule extends Omit<SuggestedRule, 'sourceClusterId'> {
  sourceClusterId?: string;
}

/** Build all phrase-rule suggestions from a tactic-frequency map. */
export function phraseRulesFromTactics(
  tacticCounts: Map<string, { frequency: number; totalScamScore: number }>,
): PhraseSuggestedRule[] {
  const out: PhraseSuggestedRule[] = [];
  for (const [tactic, stats] of tacticCounts) {
    if (stats.frequency < MIN_TACTIC_FREQUENCY) continue;
    const avg = stats.frequency > 0 ? stats.totalScamScore / stats.frequency : 0;
    const suggestion = phraseRuleSuggestion(tactic, stats.frequency, avg);
    if (!suggestion) continue;
    const { sourceClusterId: _sc, ...rest } = suggestion;
    out.push(rest);
  }
  return out;
}
