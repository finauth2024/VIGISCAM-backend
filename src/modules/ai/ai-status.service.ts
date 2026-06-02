import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * AI worker toggle status (Phase 11B).
 *
 * Every AI engine in VIGISCAM runs on the same contract: a deterministic
 * in-process stub answers by default, and when `AI_SERVICE_URL` is
 * configured the call is proxied to the external Python worker instead.
 * The stub is the documented fallback — it is never removed, so the
 * platform degrades gracefully if the AI tier is down.
 *
 * This service reports which mode each engine is in plus a live tally of
 * what actually ran (from the AIDecision audit trail), so an operator or
 * validator can confirm the toggle is doing what they expect.
 */
@Injectable()
export class AiStatusService {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  /** The AI engines that honour the AI_SERVICE_URL toggle. */
  private static readonly ENGINES = [
    { serviceKind: 'NLP_CLASSIFIER', label: 'A1SCAMSHIELD NLP classifier' },
    { serviceKind: 'EMBEDDING', label: 'ScamScript Genome embeddings' },
    { serviceKind: 'AUTHENTICITY', label: 'Authenticity suite (face/voice/scene)' },
    { serviceKind: 'OSINT', label: 'OSINT enrichment' },
    { serviceKind: 'FRAUD_JOURNEY', label: 'Fraud Journey assessment' },
    { serviceKind: 'VICTIM_STATE', label: 'Victim State assessment' },
    { serviceKind: 'PREDICTED_NEXT_MOVE', label: 'Predicted Next Move' },
  ];

  status() {
    const externalConfigured = Boolean(this.config.get<string>('aiServiceUrl'));
    const mode = externalConfigured ? 'EXTERNAL' : 'STUB';
    return {
      aiServiceConfigured: externalConfigured,
      // When the external tier is down a call falls back to STUB at
      // request time even if configured — `mode` is the configured intent.
      defaultMode: mode,
      engines: AiStatusService.ENGINES.map((e) => ({
        serviceKind: e.serviceKind,
        label: e.label,
        mode,
        fallback: 'STUB',
      })),
      note:
        'Stubs are the documented fallback and are never removed. Set AI_SERVICE_URL ' +
        'to route every engine to the external Python workers (source=EXTERNAL).',
    };
  }

  /** Live tally of recorded AI decisions grouped by engine + source. */
  async usage() {
    const grouped = await this.prisma.aIDecision.groupBy({
      by: ['serviceKind', 'source'],
      _count: { _all: true },
    });
    return grouped.map((g) => ({
      serviceKind: g.serviceKind,
      source: g.source,
      count: g._count._all,
    }));
  }
}
