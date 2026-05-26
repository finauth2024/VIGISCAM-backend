import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ScamSignal, ScamSignalStatus, SignalSourceType, TenantType } from '@prisma/client';
import { RequestContext } from '../../common/auth/auth.types';
import { PartnerPrincipal } from '../../common/auth/partner.types';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EmbeddingService } from '../ai/embedding.service';
import { NlpClassifierService } from '../ai/nlp-classifier.service';
import { ClusterService } from '../clustering/cluster.service';
import { EvidenceService } from '../evidence-vault/evidence.service';
import { FraudGraphService } from '../fraud-graph/fraud-graph.service';
import { SubmitScamReportDto } from './dto/submit-scam-report.dto';
import { normalizeIndicator } from './normalization';

const PUBLIC_REPORT_ACK =
  'Report received. VIGISCAM will review and classify the signal before any public-safe use.';
const PARTNER_REPORT_ACK =
  'Partner report accepted and queued for review.';

export interface SubmitReportResult {
  status: 'UNVERIFIED_REPORT';
  message: string;
  signalId: string;
}

export interface PartnerReportResult {
  status: 'PARTNER_REPORT_ACCEPTED';
  message: string;
  signalId: string;
  internalStatus: ScamSignalStatus;
  clusterId: string | null;
  confidenceScore: number;
}

interface SignalScores {
  sourceReliabilityScore: number;
  evidenceStrengthScore: number;
  recencyScore: number;
  confidenceScore: number;
}

interface IntakeOptions {
  dto: SubmitScamReportDto;
  sourceType: SignalSourceType;
  tenantId?: string | null;
  submittedByUserId?: string | null;
  actorType: 'PUBLIC' | 'PARTNER' | 'INTERNAL';
  extraEvidenceMetadata?: Record<string, unknown>;
}

/**
 * Scam-signal intake (PDF §11, §16.1, §30, §31). A report is normalized,
 * de-duplicated, reliability/confidence-scored, stored privately, clustered,
 * and logged to the Evidence Vault. A signal is NEVER automatically verified
 * or public. Both public (`submitReport`) and partner (`submitPartnerReport`)
 * intake paths share one private intake engine.
 */
@Injectable()
export class ScamSignalsService {
  private readonly logger = new Logger(ScamSignalsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly evidence: EvidenceService,
    private readonly cluster: ClusterService,
    private readonly nlp: NlpClassifierService,
    private readonly embeddings: EmbeddingService,
    private readonly graph: FraudGraphService,
  ) {}

  /** Public intake — anonymous, USER_REPORT reliability profile. */
  async submitReport(
    dto: SubmitScamReportDto,
    ctx: RequestContext = {},
  ): Promise<SubmitReportResult> {
    const signal = await this.intake({ dto, sourceType: 'USER_REPORT', actorType: 'PUBLIC' }, ctx);
    // The public response never leaks internal status.
    return { status: 'UNVERIFIED_REPORT', message: PUBLIC_REPORT_ACK, signalId: signal.id };
  }

  /**
   * Partner intake (Phase 5B). The signal is tagged with the partner tenant
   * and the partner's source type (derived from the tenant's category), which
   * carries a higher base reliability than a public user report.
   */
  async submitPartnerReport(
    partner: PartnerPrincipal,
    dto: SubmitScamReportDto,
    ctx: RequestContext = {},
  ): Promise<PartnerReportResult> {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: partner.tenantId } });
    if (!tenant) {
      // Should not happen — the API key has a FK to a Tenant; defensive only.
      throw new NotFoundException('Partner tenant not found');
    }
    const sourceType = this.partnerSourceTypeFor(tenant.type);
    const signal = await this.intake(
      {
        dto,
        sourceType,
        tenantId: partner.tenantId,
        actorType: 'PARTNER',
        extraEvidenceMetadata: {
          partnerKeyId: partner.keyId,
          partnerKeyPrefix: partner.keyPrefix,
          tenantType: tenant.type,
        },
      },
      ctx,
    );
    return {
      status: 'PARTNER_REPORT_ACCEPTED',
      message: PARTNER_REPORT_ACK,
      signalId: signal.id,
      internalStatus: signal.status,
      clusterId: signal.clusterId,
      confidenceScore: signal.confidenceScore,
    };
  }

  /** Reviewer-facing signal list. */
  listSignals(status?: string): Promise<ScamSignal[]> {
    const valid = (Object.values(ScamSignalStatus) as string[]).includes(status ?? '');
    return this.prisma.scamSignal.findMany({
      where: valid ? { status: status as ScamSignalStatus } : {},
      orderBy: { lastSeen: 'desc' },
      take: 200,
    });
  }

  /** Reviewer-facing signal detail. */
  async getSignal(id: string) {
    const signal = await this.prisma.scamSignal.findUnique({
      where: { id },
      include: { evidence: true },
    });
    if (!signal) {
      throw new NotFoundException('Scam signal not found');
    }
    return signal;
  }

  // ─────────────── Private intake engine ───────────────

  private async intake(opts: IntakeOptions, ctx: RequestContext): Promise<ScamSignal> {
    const {
      dto,
      sourceType,
      tenantId = null,
      submittedByUserId = null,
      actorType,
      extraEvidenceMetadata,
    } = opts;

    const normalized = normalizeIndicator(dto.indicatorType, dto.indicatorValue);
    const profile = await this.prisma.sourceReliabilityProfile.findUnique({
      where: { sourceType },
    });
    const base = profile?.baseReliabilityScore ?? 35;

    // Deduplicate: same normalized indicator + type => one signal, repeat-counted.
    const existing = await this.prisma.scamSignal.findFirst({
      where: { normalizedIndicator: normalized, indicatorType: dto.indicatorType },
      orderBy: { createdAt: 'asc' },
    });

    let signal: ScamSignal;
    let isDuplicate = false;

    if (existing) {
      isDuplicate = true;
      const reportCount = existing.reportCount + 1;
      const category = existing.category ?? dto.category ?? null;
      const description = existing.description ?? dto.description ?? null;
      const rawText = existing.rawText ?? dto.rawText ?? null;
      const scores = this.scoreSignal({
        base,
        hasDescription: !!description,
        hasRawText: !!rawText,
        reportCount,
        hasCategory: !!category,
      });
      signal = await this.prisma.scamSignal.update({
        where: { id: existing.id },
        data: {
          reportCount,
          lastSeen: new Date(),
          category,
          description,
          rawText,
          ...scores,
          status: this.deriveStatus(reportCount, scores.confidenceScore),
        },
      });
    } else {
      const reportCount = 1;
      const scores = this.scoreSignal({
        base,
        hasDescription: !!dto.description,
        hasRawText: !!dto.rawText,
        reportCount,
        hasCategory: !!dto.category,
      });
      signal = await this.prisma.scamSignal.create({
        data: {
          sourceType,
          tenantId,
          submittedByUserId,
          indicatorType: dto.indicatorType,
          indicatorValue: dto.indicatorValue.trim(),
          normalizedIndicator: normalized,
          category: dto.category,
          description: dto.description,
          rawText: dto.rawText,
          geography: dto.geography,
          reportCount,
          ...scores,
          status: this.deriveStatus(reportCount, scores.confidenceScore),
        },
      });
    }

    await this.evidence.append({
      tenantId,
      actorType,
      entityType: 'SCAM_SIGNAL',
      entityId: signal.id,
      eventType: isDuplicate ? 'SIGNAL_DUPLICATE_MERGED' : 'SIGNAL_COLLECTED',
      eventDescription: `Scam report ${isDuplicate ? 'merged into an existing' : 'collected as a new'} signal (${dto.indicatorType})`,
      metadata: {
        indicatorType: dto.indicatorType,
        reportCount: signal.reportCount,
        confidenceScore: signal.confidenceScore,
        sourceType,
        ...(extraEvidenceMetadata ?? {}),
      },
      ipAddress: ctx.ip ?? null,
    });

    // Connect the signal into a cluster of related scam infrastructure
    // (PDF §32). Best-effort — a clustering failure must never fail intake.
    // After the link, re-fetch so the returned object reflects the new
    // clusterId (the in-memory copy from the initial create/update is stale).
    try {
      await this.cluster.clusterSignal(signal, ctx);
      const refreshed = await this.prisma.scamSignal.findUnique({
        where: { id: signal.id },
      });
      if (refreshed) {
        signal = refreshed;
      }
    } catch (err) {
      this.logger.warn(`Clustering failed for signal ${signal.id}: ${String(err)}`);
    }

    // NLP enrichment (PDF non-negotiable #13 — every AI decision is audited
    // as an AIDecision row). Best-effort, stub-backed when no external AI
    // service is configured. The verdict is recorded but does NOT auto-
    // mutate the signal's category or status — that still requires reviewer
    // action via the review queue.
    const enrichmentText = [dto.description, dto.rawText].filter(Boolean).join('\n').trim();
    if (enrichmentText) {
      try {
        await this.nlp.classify(
          {
            text: enrichmentText,
            indicatorType: dto.indicatorType,
            hintedCategory: dto.category ?? null,
          },
          { entityType: 'SCAM_SIGNAL', entityId: signal.id },
        );
      } catch (err) {
        this.logger.warn(`NLP classification failed for signal ${signal.id}: ${String(err)}`);
      }

      // Embed for similarity-based clustering (PDF §32 advanced version).
      // Best-effort; the in-memory signal's embedding relation is not
      // mutated — the link lives on the SignalEmbedding row.
      try {
        await this.embeddings.embedSignal(signal, enrichmentText);
      } catch (err) {
        this.logger.warn(`Embedding failed for signal ${signal.id}: ${String(err)}`);
      }
    }

    // Project the signal onto the Identity Collision Graph (Phase 6C, PDF
    // §32). Runs after clustering + embedding so cluster + similarity edges
    // can be materialised in one pass. Best-effort — never breaks intake.
    try {
      await this.graph.processSignal(signal);
    } catch (err) {
      this.logger.warn(`Fraud-graph processing failed for signal ${signal.id}: ${String(err)}`);
    }

    // High-risk signals are queued for internal review (PDF §16.1).
    if (signal.status === 'SUSPICIOUS_SIGNAL' || signal.status === 'PATTERN_MATCH') {
      const queued = await this.prisma.registryReviewQueue.findFirst({
        where: { signalId: signal.id, reviewStatus: { not: 'COMPLETED' } },
      });
      if (!queued) {
        await this.prisma.registryReviewQueue.create({
          data: { signalId: signal.id, reviewStatus: 'PENDING' },
        });
      }
    }

    return signal;
  }

  /** Map a partner tenant's type to the right SignalSourceType (PDF §31). */
  private partnerSourceTypeFor(tenantType: TenantType): SignalSourceType {
    switch (tenantType) {
      case TenantType.BANK:
        return 'BANK_REPORT';
      case TenantType.AGENCY:
        return 'GOVERNMENT_ADVISORY';
      case TenantType.INVESTIGATOR:
        return 'INVESTIGATOR';
      case TenantType.INTERNAL:
        return 'INTERNAL';
      default:
        // PLATFORM, ENTERPRISE (and the never-eligible PUBLIC/PERSONAL/FAMILY).
        return 'PARTNER_REPORT';
    }
  }

  /** Confidence model (PDF §31) — 0–100 from weighted sub-scores. */
  private scoreSignal(input: {
    base: number;
    hasDescription: boolean;
    hasRawText: boolean;
    reportCount: number;
    hasCategory: boolean;
  }): SignalScores {
    const sourceReliabilityScore = Math.round((input.base / 100) * 30);
    const evidenceStrengthScore = Math.min(
      25,
      (input.hasDescription ? 8 : 3) + (input.hasRawText ? 6 : 0),
    );
    const recencyScore = 10;
    const repeatOccurrence = Math.min(15, input.reportCount * 3);
    const categoryMatch = input.hasCategory ? 8 : 0;
    const confidenceScore = Math.min(
      100,
      sourceReliabilityScore + evidenceStrengthScore + recencyScore + repeatOccurrence + categoryMatch,
    );
    return { sourceReliabilityScore, evidenceStrengthScore, recencyScore, confidenceScore };
  }

  /** Auto-triage status — none of these mean "verified" (PDF §16.1). */
  private deriveStatus(reportCount: number, confidence: number): ScamSignalStatus {
    if (reportCount >= 3) return 'PATTERN_MATCH';
    if (confidence >= 55) return 'SUSPICIOUS_SIGNAL';
    return 'UNVERIFIED_REPORT';
  }
}
