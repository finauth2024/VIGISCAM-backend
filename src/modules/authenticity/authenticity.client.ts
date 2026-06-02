import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { stubAuthenticityCheck } from './authenticity-stub';
import { AuthenticityRequest, AuthenticityResponse } from './authenticity.types';

export interface AuthenticityClientResult {
  output: AuthenticityResponse;
  source: 'STUB' | 'EXTERNAL';
}

/**
 * Calls the external Authenticity Verification Suite when AI_SERVICE_URL is
 * configured, falling back to the in-process stub otherwise. Never throws.
 *
 * The timeout is deliberately large (default 120s, AI_AUTHENTICITY_TIMEOUT_MS):
 * the heavy deepfake/voice models are slow on CPU and the *first* call lazy-
 * loads the model (download + load). The other AI clients use a 5s timeout
 * because their MiniLM backbone is pre-warmed; the vision/voice tier is not.
 */
@Injectable()
export class AuthenticityClient {
  private readonly logger = new Logger(AuthenticityClient.name);
  private readonly baseUrl: string | undefined;
  private readonly timeoutMs: number;

  constructor(config: ConfigService) {
    this.baseUrl = config.get<string>('aiServiceUrl') || undefined;
    this.timeoutMs = config.get<number>('aiAuthenticityTimeoutMs', 120_000);
  }

  async run(req: AuthenticityRequest): Promise<AuthenticityClientResult> {
    if (!this.baseUrl) {
      return { output: stubAuthenticityCheck(req), source: 'STUB' };
    }
    const checkPath = req.checkType.toLowerCase().replace(/_/g, '-');
    try {
      const res = await fetch(`${this.baseUrl.replace(/\/$/, '')}/authenticity/${checkPath}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (!res.ok) {
        this.logger.warn(
          `Authenticity service ${res.status} for ${req.checkType} — using stub fallback`,
        );
        return { output: stubAuthenticityCheck(req), source: 'STUB' };
      }
      const body = (await res.json()) as AuthenticityResponse;
      return { output: body, source: 'EXTERNAL' };
    } catch (err) {
      this.logger.warn(
        `Authenticity service unreachable for ${req.checkType} (${String(err)}) — using stub fallback`,
      );
      return { output: stubAuthenticityCheck(req), source: 'STUB' };
    }
  }
}
