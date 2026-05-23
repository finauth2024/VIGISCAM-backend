import { Injectable } from '@nestjs/common';
import { DetectionRule } from '@prisma/client';
import { AuthenticatedUser, RequestContext } from '../../common/auth/auth.types';
import { PrismaService } from '../../common/prisma/prisma.service';
import { DetectionRuleService } from './detection-rule.service';
import { suggestionForCluster } from './suggestions';

/** Minimum signals in a cluster before we suggest a rule for it. */
const MIN_SIGNALS_FOR_SUGGESTION = 3;

export interface GenerateSuggestionsResult {
  scanned: number;
  created: number;
  ruleIds: string[];
}

/**
 * Generates DRAFT detection-rule suggestions from clusters of verified
 * intelligence (PDF §33). A suggestion never auto-activates — it always lands
 * as DRAFT, requiring an admin/compliance reviewer to push it through TESTING
 * to ACTIVE (the no-auto-activation guardrail from 4B).
 */
@Injectable()
export class RuleSuggestionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rules: DetectionRuleService,
  ) {}

  /**
   * Scan ACTIVE clusters of verified intelligence and create a DRAFT detection
   * rule for each that does not already have a non-RETIRED rule attached.
   */
  async generateSuggestions(
    actor: AuthenticatedUser,
    ctx: RequestContext = {},
  ): Promise<GenerateSuggestionsResult> {
    const candidates = await this.prisma.scamCluster.findMany({
      where: {
        status: 'ACTIVE',
        signalCount: { gte: MIN_SIGNALS_FOR_SUGGESTION },
        // At least one of the cluster's signals is verified-grade intelligence.
        signals: {
          some: {
            status: { in: ['VERIFIED_SCAM_INTELLIGENCE', 'HIGH_RISK_INDICATOR'] },
          },
        },
        // Skip clusters that already have a live (non-RETIRED) suggestion or rule.
        detectionRules: { none: { status: { not: 'RETIRED' } } },
      },
      take: 50,
    });

    const created: DetectionRule[] = [];
    for (const cluster of candidates) {
      const suggestion = suggestionForCluster(cluster);
      if (!suggestion) {
        continue;
      }
      const rule = await this.rules.createSuggestion(actor, suggestion, ctx);
      created.push(rule);
    }

    return {
      scanned: candidates.length,
      created: created.length,
      ruleIds: created.map((r) => r.id),
    };
  }
}
