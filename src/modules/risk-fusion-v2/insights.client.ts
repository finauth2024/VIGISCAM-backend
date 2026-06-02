import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FraudJourneyStage } from '@prisma/client';
import {
  InsightHints,
  JourneyResult,
  PredictedMoveResult,
  stubAssessJourney,
  stubAssessVictimState,
  stubPredictNextMove,
  VictimStateResult,
} from './insights-stub';

const REQUEST_TIMEOUT_MS = 5_000;

export type InsightSource = 'STUB' | 'EXTERNAL';

export interface InsightResult<T> {
  output: T;
  source: InsightSource;
}

/**
 * Phase 11B — the external-worker toggle for the three Phase 6E insight
 * engines (fraud-journey / victim-state / predicted-next-move).
 *
 * Mirrors the 6A NlpClient / 6B EmbeddingClient contract exactly: when
 * `AI_SERVICE_URL` is configured every call is proxied to the Python
 * service; when it is not — or when the call fails or times out — the
 * in-process stub answers instead. The method never throws, because a
 * risk-fusion run must not break just because the AI tier is down.
 *
 * The `source` the caller gets back is the truth about which path ran,
 * so RiskFusionV2Service can persist STUB vs EXTERNAL accurately on both
 * the assessment row and its AIDecision audit row.
 */
@Injectable()
export class InsightsClient {
  private readonly logger = new Logger(InsightsClient.name);
  private readonly baseUrl: string | undefined;

  constructor(config: ConfigService) {
    this.baseUrl = config.get<string>('aiServiceUrl') || undefined;
  }

  /** Observability: is the external AI tier configured at all? */
  isExternalConfigured(): boolean {
    return Boolean(this.baseUrl);
  }

  async assessJourney(hints: InsightHints): Promise<InsightResult<JourneyResult>> {
    return this.call('/insights/journey', hints, () => stubAssessJourney(hints));
  }

  async assessVictimState(hints: InsightHints): Promise<InsightResult<VictimStateResult>> {
    return this.call('/insights/victim-state', hints, () => stubAssessVictimState(hints));
  }

  async predictNextMove(
    currentStage: FraudJourneyStage,
  ): Promise<InsightResult<PredictedMoveResult>> {
    return this.call('/insights/predicted-move', { currentStage }, () =>
      stubPredictNextMove(currentStage),
    );
  }

  /**
   * Shared external-or-stub dispatch. Keeps the fallback semantics in one
   * place: no base URL → stub; non-2xx → stub; throw/timeout → stub.
   */
  private async call<T>(path: string, body: unknown, stub: () => T): Promise<InsightResult<T>> {
    if (!this.baseUrl) {
      return { output: stub(), source: 'STUB' };
    }
    try {
      const res = await fetch(`${this.baseUrl.replace(/\/$/, '')}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!res.ok) {
        this.logger.warn(`AI insights ${path} → ${res.status}; using stub fallback`);
        return { output: stub(), source: 'STUB' };
      }
      const out = (await res.json()) as T;
      return { output: out, source: 'EXTERNAL' };
    } catch (err) {
      this.logger.warn(`AI insights ${path} unreachable (${String(err)}); using stub fallback`);
      return { output: stub(), source: 'STUB' };
    }
  }
}
