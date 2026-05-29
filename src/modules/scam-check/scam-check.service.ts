import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { RequestContext } from '../../common/auth/auth.types';
import { PrismaService } from '../../common/prisma/prisma.service';
import { detectScamLanguage } from '../a1scamshield/a1scamshield.detection';
import { EvidenceService } from '../evidence-vault/evidence.service';
import { normalizeIndicator } from '../scam-signals/normalization';
import { ScamSignalsService } from '../scam-signals/scam-signals.service';
import { ScamCheckDto } from './dto/scam-check.dto';
import { scoreScamCheck } from './scam-check.scoring';

export interface ScamCheckResponse {
  checkId: string;
  input: { type: string; value: string };
  riskScore: number;
  riskLevel: string;
  category: string | null;
  assessment: string;
  matchedIntelligence: {
    inPublicRegistry: boolean;
    reportsOnRecord: number;
    scamLanguageDetected: string[];
  };
  recommendedAction: string;
  safeNextSteps: string[];
  reportSubmitted: boolean;
}

/**
 * The public consumer scam check (PDF §16.4, §29.1). Anyone — no login — can
 * check an indicator and get a risk score with safe next steps.
 *
 * Public-safety rule: internal scam signals are used to SCORE the check, but
 * their raw content is NEVER returned. The response carries only a score, a
 * status-based safe message, an aggregate match summary, and safe guidance.
 */
@Injectable()
export class ScamCheckService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly evidence: EvidenceService,
    private readonly scamSignals: ScamSignalsService,
  ) {}

  async check(dto: ScamCheckDto, ctx: RequestContext = {}): Promise<ScamCheckResponse> {
    const normalized = normalizeIndicator(dto.indicatorType, dto.indicatorValue);

    // 1. Public registry — verified, PUBLISHED, public-safe entries only.
    const registryMatch = await this.prisma.registryEntry.findFirst({
      where: {
        normalizedIndicator: normalized,
        indicatorType: dto.indicatorType,
        status: 'PUBLISHED',
      },
    });

    // 2. Internal signals — used to SCORE only; raw content is never returned.
    const signals = await this.prisma.scamSignal.findMany({
      where: { normalizedIndicator: normalized, indicatorType: dto.indicatorType },
      take: 50,
    });

    // 3. A1SCAMSHIELD scam-language scan of any submitted text.
    const text = dto.rawText ?? (dto.indicatorType === 'SCAM_PHRASE' ? dto.indicatorValue : '');
    const language = detectScamLanguage(text);

    // 4. Combine into a 0–100 risk score.
    const { score, level } = scoreScamCheck({
      registryListed: !!registryMatch,
      registryConfidence: registryMatch?.confidenceScore,
      signals: signals.map((s) => ({
        status: s.status,
        confidenceScore: s.confidenceScore,
        reportCount: s.reportCount,
      })),
      languageSignalCount: language.signals.length,
    });

    const category = registryMatch?.category ?? signals.find((s) => s.category)?.category ?? null;

    // 5. Persist the check result.
    const result = await this.prisma.scamCheckResult.create({
      data: {
        inputType: dto.indicatorType,
        inputValue: dto.indicatorValue.trim(),
        normalizedInput: normalized,
        riskScore: score,
        riskLevel: level,
        category,
        matchedRegistry: registryMatch
          ? {
              id: registryMatch.id,
              status: registryMatch.status,
              category: registryMatch.category,
            }
          : Prisma.JsonNull,
        matchedSignals: {
          count: signals.length,
          totalReports: signals.reduce((sum, s) => sum + s.reportCount, 0),
        },
        suggestedAction: this.recommendedAction(level),
        savedToEvidence: true,
      },
    });

    // 6. Log the completed check to the Evidence Vault.
    await this.evidence.append({
      tenantId: null,
      actorType: 'PUBLIC',
      entityType: 'SCAM_CHECK',
      entityId: result.id,
      eventType: 'SCAM_CHECK_COMPLETED',
      eventDescription: `Public scam check on a ${dto.indicatorType} scored ${score} (${level})`,
      metadata: { riskScore: score, riskLevel: level, inPublicRegistry: !!registryMatch },
      ipAddress: ctx.ip ?? null,
    });

    // 7. Optionally file a scam report from this check.
    let reportSubmitted = false;
    if (dto.createReport) {
      await this.scamSignals.submitReport(
        {
          indicatorType: dto.indicatorType,
          indicatorValue: dto.indicatorValue,
          rawText: dto.rawText,
          category: category ?? undefined,
        },
        ctx,
      );
      reportSubmitted = true;
    }

    return {
      checkId: result.id,
      input: { type: dto.indicatorType, value: dto.indicatorValue },
      riskScore: score,
      riskLevel: level,
      category,
      assessment: this.assessment(level),
      matchedIntelligence: {
        inPublicRegistry: !!registryMatch,
        reportsOnRecord: signals.length,
        scamLanguageDetected: language.tactics,
      },
      recommendedAction: this.recommendedAction(level),
      safeNextSteps: this.safeNextSteps(level),
      reportSubmitted,
    };
  }

  private recommendedAction(level: string): string {
    switch (level) {
      case 'CRITICAL':
        return 'STOP_DO_NOT_SEND_MONEY_OR_INFORMATION';
      case 'HIGH':
        return 'DO_NOT_PROCEED_VERIFY_INDEPENDENTLY';
      case 'MEDIUM':
        return 'VERIFY_BEFORE_PROCEEDING';
      default:
        return 'PROCEED_WITH_NORMAL_CAUTION';
    }
  }

  /** Status-based safe language only — never a direct accusation (docs/04). */
  private assessment(level: string): string {
    switch (level) {
      case 'CRITICAL':
        return 'This indicator matches verified scam intelligence or strong high-risk signals. Do not send money or share information.';
      case 'HIGH':
        return 'This is a high-risk indicator and is very likely connected to a scam.';
      case 'MEDIUM':
        return 'This indicator shows suspicious signals. Treat it with caution and verify independently.';
      default:
        return 'No verified scam intelligence matched this indicator. No strong scam signals were found — always stay cautious.';
    }
  }

  private safeNextSteps(level: string): string[] {
    const steps = [
      'Do not send money, gift cards, or cryptocurrency based on this contact.',
      'Never share passwords, one-time codes, or banking details.',
      'Verify any request through an official channel you find yourself — not a number or link they gave you.',
      'If you feel rushed or pressured, pause — urgency is itself a common scam tactic.',
    ];
    if (level === 'HIGH' || level === 'CRITICAL') {
      steps.push('If money may already have been sent, contact your bank immediately.');
      steps.push('Report this to VIGISCAM and to your local authorities.');
    }
    return steps;
  }
}
