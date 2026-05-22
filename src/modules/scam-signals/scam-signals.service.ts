import { Injectable, NotFoundException } from '@nestjs/common';
import { ScamSignal, ScamSignalStatus } from '@prisma/client';
import { RequestContext } from '../../common/auth/auth.types';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EvidenceService } from '../evidence-vault/evidence.service';
import { SubmitScamReportDto } from './dto/submit-scam-report.dto';
import { normalizeIndicator } from './normalization';

const REPORT_ACK =
  'Report received. VIGISCAM will review and classify the signal before any public-safe use.';

export interface SubmitReportResult {
  status: 'UNVERIFIED_REPORT';
  message: string;
  signalId: string;
}

interface SignalScores {
  sourceReliabilityScore: number;
  evidenceStrengthScore: number;
  recencyScore: number;
  confidenceScore: number;
}

/**
 * Scam-signal intake (PDF §11, §16.1, §30, §31). A report is normalized,
 * de-duplicated, reliability/confidence-scored, stored privately, and logged
 * to the Evidence Vault. A signal is NEVER automatically verified or public.
 */
@Injectable()
export class ScamSignalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly evidence: EvidenceService,
  ) {}

  async submitReport(
    dto: SubmitScamReportDto,
    ctx: RequestContext = {},
  ): Promise<SubmitReportResult> {
    const normalized = normalizeIndicator(dto.indicatorType, dto.indicatorValue);
    const profile = await this.prisma.sourceReliabilityProfile.findUnique({
      where: { sourceType: 'USER_REPORT' },
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
          sourceType: 'USER_REPORT',
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
      tenantId: null,
      actorType: 'PUBLIC',
      entityType: 'SCAM_SIGNAL',
      entityId: signal.id,
      eventType: isDuplicate ? 'SIGNAL_DUPLICATE_MERGED' : 'SIGNAL_COLLECTED',
      eventDescription: `Scam report ${isDuplicate ? 'merged into an existing' : 'collected as a new'} signal (${dto.indicatorType})`,
      metadata: {
        indicatorType: dto.indicatorType,
        reportCount: signal.reportCount,
        confidenceScore: signal.confidenceScore,
      },
      ipAddress: ctx.ip ?? null,
    });

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

    // The public response is always the same — internal status is never leaked.
    return { status: 'UNVERIFIED_REPORT', message: REPORT_ACK, signalId: signal.id };
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
