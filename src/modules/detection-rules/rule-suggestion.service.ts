import { Injectable } from '@nestjs/common';
import { DetectionRule } from '@prisma/client';
import { AuthenticatedUser, RequestContext } from '../../common/auth/auth.types';
import { PrismaService } from '../../common/prisma/prisma.service';
import { DetectionRuleService } from './detection-rule.service';
import { phraseRulesFromTactics, suggestionForCluster } from './suggestions';

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

  /**
   * Phase 6F — derive PHRASE_MATCH suggestions from the NLP classifier's
   * verdicts on VERIFIED signals. Aggregates manipulation tactics across the
   * verified corpus, requires MIN_TACTIC_FREQUENCY occurrences, skips any
   * tactic that already has a live (non-RETIRED) phrase rule. The created
   * rules land as DRAFT — the no-auto-activation guardrail still applies.
   */
  async generatePhraseRuleSuggestions(
    actor: AuthenticatedUser,
    ctx: RequestContext = {},
  ): Promise<GenerateSuggestionsResult> {
    // 1) Find verified signals.
    const verifiedSignals = await this.prisma.scamSignal.findMany({
      where: { status: 'VERIFIED_SCAM_INTELLIGENCE' },
      select: { id: true },
      take: 1000,
    });
    if (verifiedSignals.length === 0) {
      return { scanned: 0, created: 0, ruleIds: [] };
    }

    // 2) Pull every NLP_CLASSIFIER decision attached to those signals.
    const decisions = await this.prisma.aIDecision.findMany({
      where: {
        serviceKind: 'NLP_CLASSIFIER',
        entityType: 'SCAM_SIGNAL',
        entityId: { in: verifiedSignals.map((s) => s.id) },
      },
      take: 5000,
    });

    // 3) Aggregate tactic frequencies + average scam score.
    const tacticCounts = new Map<string, { frequency: number; totalScamScore: number }>();
    for (const d of decisions) {
      const out = d.output as null | { manipulationTactics?: unknown; scamScore?: unknown };
      if (!out || !Array.isArray(out.manipulationTactics)) continue;
      const score = typeof out.scamScore === 'number' ? out.scamScore : 0;
      for (const tactic of out.manipulationTactics) {
        if (typeof tactic !== 'string') continue;
        const cur = tacticCounts.get(tactic) ?? { frequency: 0, totalScamScore: 0 };
        cur.frequency += 1;
        cur.totalScamScore += score;
        tacticCounts.set(tactic, cur);
      }
    }

    // 4) Skip tactics that already have a live phrase rule (by pattern.tactic).
    const liveRules = await this.prisma.detectionRule.findMany({
      where: {
        ruleType: 'PHRASE_MATCH',
        status: { not: 'RETIRED' },
      },
      select: { pattern: true },
    });
    const coveredTactics = new Set<string>();
    for (const r of liveRules) {
      const p = r.pattern as null | { tactic?: unknown };
      if (p && typeof p.tactic === 'string') coveredTactics.add(p.tactic);
    }

    // 5) Build suggestions and persist DRAFT rules.
    const suggestions = phraseRulesFromTactics(tacticCounts).filter(
      (s) => !coveredTactics.has((s.pattern as { tactic: string }).tactic),
    );
    const created: DetectionRule[] = [];
    for (const suggestion of suggestions) {
      const rule = await this.rules.createSuggestion(actor, suggestion, ctx);
      created.push(rule);
    }

    return {
      scanned: decisions.length,
      created: created.length,
      ruleIds: created.map((r) => r.id),
    };
  }
}
