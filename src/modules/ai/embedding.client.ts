import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { stubEmbed } from './embedding-stub';
import { EmbeddingInput, EmbeddingOutput } from './embedding.types';

const REQUEST_TIMEOUT_MS = 5_000;

export interface EmbeddingClientResult {
  output: EmbeddingOutput;
  source: 'STUB' | 'EXTERNAL';
}

/**
 * Calls the external embedding service when AI_SERVICE_URL is configured,
 * falling back to the in-process stub otherwise. Never throws — embedding
 * is enrichment, not critical-path, so intake must keep flowing.
 */
@Injectable()
export class EmbeddingClient {
  private readonly logger = new Logger(EmbeddingClient.name);
  private readonly baseUrl: string | undefined;

  constructor(config: ConfigService) {
    this.baseUrl = config.get<string>('aiServiceUrl') || undefined;
  }

  /** Returns null if the input is too short to embed even via stub. */
  async embed(input: EmbeddingInput): Promise<EmbeddingClientResult | null> {
    const fallback = (): EmbeddingClientResult | null => {
      const out = stubEmbed(input.text);
      return out ? { output: out, source: 'STUB' } : null;
    };

    if (!this.baseUrl) {
      return fallback();
    }
    try {
      const res = await fetch(`${this.baseUrl.replace(/\/$/, '')}/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!res.ok) {
        this.logger.warn(`AI embedding service ${res.status} — using stub fallback`);
        return fallback();
      }
      const body = (await res.json()) as EmbeddingOutput;
      return { output: body, source: 'EXTERNAL' };
    } catch (err) {
      this.logger.warn(`AI embedding service unreachable (${String(err)}) — using stub fallback`);
      return fallback();
    }
  }
}
