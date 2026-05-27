import { Injectable, Logger } from '@nestjs/common';
import { IndicatorType, OsintEnrichment, Prisma, ScamSignal } from '@prisma/client';
import { createHash } from 'crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { OsintClient } from './osint.client';

const SNIPPET_LEN = 200;

/** Indicator types we run the safe OSINT pipeline for. Phrase and other
 *  symbolic indicators have no public OSINT to fetch. */
const ENRICHABLE_TYPES: IndicatorType[] = ['DOMAIN', 'URL', 'EMAIL', 'PHONE', 'CRYPTO_WALLET'];

/**
 * Safe OSINT enrichment + audit. Every call writes an AIDecision row (PDF
 * non-negotiable #13). One enrichment per `(indicatorType, normalizedIndicator,
 * provider)` — re-running upserts; the table is the cache.
 */
@Injectable()
export class OsintService {
  private readonly logger = new Logger(OsintService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly client: OsintClient,
  ) {}

  /** Enrich a signal best-effort. No-op for non-enrichable indicator types. */
  async enrichSignal(signal: ScamSignal): Promise<OsintEnrichment | null> {
    if (!ENRICHABLE_TYPES.includes(signal.indicatorType)) {
      return null;
    }
    const start = Date.now();
    const { output, source } = await this.client.enrich({
      indicatorType: signal.indicatorType,
      normalizedIndicator: signal.normalizedIndicator,
    });
    const durationMs = Date.now() - start;

    const enrichment = await this.prisma.osintEnrichment.upsert({
      where: {
        indicatorType_normalizedIndicator_provider: {
          indicatorType: signal.indicatorType,
          normalizedIndicator: signal.normalizedIndicator,
          provider: output.provider,
        },
      },
      create: {
        signalId: signal.id,
        indicatorType: signal.indicatorType,
        normalizedIndicator: signal.normalizedIndicator,
        provider: output.provider,
        modelVersion: output.modelVersion,
        source,
        data: output.data as unknown as Prisma.InputJsonValue,
        riskHints: output.riskHints,
      },
      update: {
        signalId: signal.id,
        modelVersion: output.modelVersion,
        source,
        data: output.data as unknown as Prisma.InputJsonValue,
        riskHints: output.riskHints,
      },
    });

    const inputCanonical = JSON.stringify({
      indicatorType: signal.indicatorType,
      normalizedIndicator: signal.normalizedIndicator,
    });
    await this.prisma.aIDecision.create({
      data: {
        serviceKind: 'OSINT_ENRICHMENT',
        modelVersion: output.modelVersion,
        source,
        entityType: 'SCAM_SIGNAL',
        entityId: signal.id,
        inputDigest: createHash('sha256').update(inputCanonical).digest('hex'),
        inputSnippet: inputCanonical.slice(0, SNIPPET_LEN),
        output: output as unknown as Prisma.InputJsonValue,
        durationMs,
      },
    });
    return enrichment;
  }

  list(
    filters: { signalId?: string; indicatorType?: string; normalizedIndicator?: string } = {},
    limit = 100,
  ) {
    const where: Prisma.OsintEnrichmentWhereInput = {};
    if (filters.signalId) where.signalId = filters.signalId;
    if (
      filters.indicatorType &&
      (Object.values(IndicatorType) as string[]).includes(filters.indicatorType)
    ) {
      where.indicatorType = filters.indicatorType as IndicatorType;
    }
    if (filters.normalizedIndicator) {
      where.normalizedIndicator = filters.normalizedIndicator;
    }
    return this.prisma.osintEnrichment.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 500),
    });
  }
}
