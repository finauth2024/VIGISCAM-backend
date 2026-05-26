import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { classifyWithStub } from './nlp-stub';
import { NlpClassificationInput, NlpClassificationOutput } from './nlp.types';

const REQUEST_TIMEOUT_MS = 5_000;

export interface NlpClassificationResult {
  output: NlpClassificationOutput;
  source: 'STUB' | 'EXTERNAL';
}

/**
 * Calls the external Python NLP service when `AI_SERVICE_URL` is configured,
 * falling back to the in-process stub when it is not — or when the external
 * call fails. Never throws to the caller; intake flows must not break because
 * the AI tier is down.
 */
@Injectable()
export class NlpClient {
  private readonly logger = new Logger(NlpClient.name);
  private readonly baseUrl: string | undefined;

  constructor(config: ConfigService) {
    this.baseUrl = config.get<string>('aiServiceUrl') || undefined;
  }

  async classify(input: NlpClassificationInput): Promise<NlpClassificationResult> {
    if (!this.baseUrl) {
      return { output: classifyWithStub(input), source: 'STUB' };
    }
    try {
      const res = await fetch(`${this.baseUrl.replace(/\/$/, '')}/nlp/classify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!res.ok) {
        this.logger.warn(`AI NLP service ${res.status} — using stub fallback`);
        return { output: classifyWithStub(input), source: 'STUB' };
      }
      const body = (await res.json()) as NlpClassificationOutput;
      return { output: body, source: 'EXTERNAL' };
    } catch (err) {
      this.logger.warn(`AI NLP service unreachable (${String(err)}) — using stub fallback`);
      return { output: classifyWithStub(input), source: 'STUB' };
    }
  }
}
