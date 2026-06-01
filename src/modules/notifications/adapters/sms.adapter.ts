import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import twilio, { Twilio } from 'twilio';
import { AdapterResult, ChannelAdapter, NotificationSendArgs } from './adapter.types';

/**
 * Twilio-backed SMS adapter. Same graceful-stub behaviour as EmailAdapter.
 *
 * For Phase 9 critical-risk flows (Guardian Pause, trusted-contact review),
 * SMS is the primary out-of-band channel — the body is intentionally short
 * + status-based and contains no PII (per docs/04 §3 safe-language rules).
 */
@Injectable()
export class SmsAdapter implements ChannelAdapter {
  readonly channel = 'SMS' as const;
  private readonly logger = new Logger(SmsAdapter.name);
  private client: Twilio | null = null;
  private fromNumber: string | undefined;

  constructor(config: ConfigService) {
    const sid = config.get<string>('TWILIO_ACCOUNT_SID');
    const token = config.get<string>('TWILIO_AUTH_TOKEN');
    this.fromNumber = config.get<string>('TWILIO_FROM_NUMBER');
    if (sid && token) {
      this.client = twilio(sid, token);
    }
  }

  isConfigured(): boolean {
    return Boolean(this.client && this.fromNumber);
  }

  async send(args: NotificationSendArgs): Promise<AdapterResult> {
    if (!this.isConfigured()) {
      this.logger.log(`[stub-sms] to=${args.recipient} body=${args.body.length}chars`);
      return { ok: true, skipped: true };
    }
    try {
      const msg = await this.client!.messages.create({
        to: args.recipient,
        from: this.fromNumber!,
        body: args.body,
      });
      return { ok: true, providerMessageId: msg.sid };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}
