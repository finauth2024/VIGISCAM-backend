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
