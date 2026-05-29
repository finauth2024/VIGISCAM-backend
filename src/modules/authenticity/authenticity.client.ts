import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { stubAuthenticityCheck } from './authenticity-stub';
import { AuthenticityRequest, AuthenticityResponse } from './authenticity.types';

const REQUEST_TIMEOUT_MS = 5_000;

export interface AuthenticityClientResult {
  output: AuthenticityResponse;
  source: 'STUB' | 'EXTERNAL';
}

/**
 * Calls the external Authenticity Verification Suite when AI_SERVICE_URL is
 * configured, falling back to the in-process stub otherwise. Never throws.
 */
@Injectable()
export class AuthenticityClient {
  private readonly logger = new Logger(AuthenticityClient.name);
  private readonly baseUrl: string | undefined;

  constructor(config: ConfigService) {
    this.baseUrl = config.get<string>('aiServiceUrl') || undefined;
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
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
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
