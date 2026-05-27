import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { stubOsintEnrich } from './osint-stub';
import { OsintEnrichmentInput, OsintEnrichmentOutput } from './osint.types';

const REQUEST_TIMEOUT_MS = 5_000;

export interface OsintClientResult {
  output: OsintEnrichmentOutput;
  source: 'STUB' | 'EXTERNAL';
}

/**
 * Calls the external OSINT provider when AI_SERVICE_URL is configured,
 * falling back to the in-process stub otherwise. Never throws — enrichment
 * is best-effort, not critical path.
 */
@Injectable()
export class OsintClient {
  private readonly logger = new Logger(OsintClient.name);
  private readonly baseUrl: string | undefined;

  constructor(config: ConfigService) {
    this.baseUrl = config.get<string>('aiServiceUrl') || undefined;
  }

  async enrich(input: OsintEnrichmentInput): Promise<OsintClientResult> {
    if (!this.baseUrl) {
      return { output: stubOsintEnrich(input), source: 'STUB' };
    }
    const path = input.indicatorType.toLowerCase();
    try {
      const res = await fetch(`${this.baseUrl.replace(/\/$/, '')}/osint/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!res.ok) {
        this.logger.warn(`OSINT service ${res.status} for ${input.indicatorType} — using stub`);
        return { output: stubOsintEnrich(input), source: 'STUB' };
      }
      const body = (await res.json()) as OsintEnrichmentOutput;
      return { output: body, source: 'EXTERNAL' };
    } catch (err) {
      this.logger.warn(
        `OSINT service unreachable for ${input.indicatorType} (${String(err)}) — using stub`,
      );
      return { output: stubOsintEnrich(input), source: 'STUB' };
    }
  }
}
