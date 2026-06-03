import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { IndicatorType, OsintEnrichment, Prisma, ScamSignal } from '@prisma/client';
import { createHash } from 'crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { QUEUE_NAMES } from '../../common/queue/queue-names';
import { QueueService } from '../../common/queue/queue.service';
import { OsintClient } from './osint.client';
import { OsintProviderRegistry } from './providers/osint-provider.registry';

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
    private readonly providers: OsintProviderRegistry,
    private readonly queue: QueueService,
  ) {}

  /** CP-6 — the OSINT provider catalog + which external feeds are live. */
  providerCatalog() {
    return this.providers.catalog();
  }

  /**
   * CP-10 — enqueue a background OSINT enrichment for a signal. Falls back to
   * synchronous enrichment when Redis isn't configured (dev/single-process), so
   * the call always does useful work.
   */
  async enqueueEnrichment(signalId: string): Promise<{ queued: boolean }> {
    const signal = await this.prisma.scamSignal.findUnique({ where: { id: signalId } });
    if (!signal) throw new NotFoundException('Scam signal not found');
    const jobId = await this.queue.enqueue(QUEUE_NAMES.OsintEnrichment, {
      signalId: signal.id,
      indicatorType: signal.indicatorType,
      normalizedIndicator: signal.normalizedIndicator,
    });
    if (!jobId) {
      await this.enrichSignal(signal);
      return { queued: false };
    }
    return { queued: true };
  }

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

    // CP-6 — fan out to the external provider layer (WHOIS / passive DNS /
    // reputation / blockchain / takedown / advisories). Each live provider that
    // returns findings is stored as its own enrichment row. Providers that
    // aren't configured (no API key) yield nothing and are skipped. Best-effort:
    // never let provider enrichment break the structural pipeline.
    try {
      const runs = await this.providers.enrich({
        indicatorType: signal.indicatorType,
        normalizedIndicator: signal.normalizedIndicator,
      });
      for (const run of runs) {
        if (!run.provider.isLive() && run.result.riskHints.length === 0) continue;
        await this.prisma.osintEnrichment.upsert({
          where: {
            indicatorType_normalizedIndicator_provider: {
              indicatorType: signal.indicatorType,
              normalizedIndicator: signal.normalizedIndicator,
              provider: run.provider.name,
            },
          },
          create: {
            signalId: signal.id,
            indicatorType: signal.indicatorType,
            normalizedIndicator: signal.normalizedIndicator,
            provider: run.provider.name,
            modelVersion: `provider:${run.provider.category}`,
            source: run.provider.isLive() ? 'EXTERNAL' : 'STUB',
            data: run.result.data as unknown as Prisma.InputJsonValue,
            riskHints: run.result.riskHints,
          },
          update: {
            signalId: signal.id,
            source: run.provider.isLive() ? 'EXTERNAL' : 'STUB',
            data: run.result.data as unknown as Prisma.InputJsonValue,
            riskHints: run.result.riskHints,
          },
        });
      }
    } catch (err: unknown) {
      this.logger.warn(`OSINT provider enrichment failed for ${signal.id}: ${String(err)}`);
    }

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
