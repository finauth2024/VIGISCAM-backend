import sgMail from '@sendgrid/mail';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AdapterResult, ChannelAdapter, NotificationSendArgs } from './adapter.types';

/**
 * SendGrid-backed email adapter.
 *
 * Missing creds → `send()` logs the would-be delivery + returns `{ ok: true,
 * skipped: true }`. NotificationService records the attempt as `SKIPPED`
 * so observability still has a row. This keeps dev / acceptance suites
 * green without a real SendGrid account.
 */
@Injectable()
export class EmailAdapter implements ChannelAdapter {
  readonly channel = 'EMAIL' as const;
  private readonly logger = new Logger(EmailAdapter.name);
  private apiKey: string | undefined;
  private fromEmail: string | undefined;

  constructor(config: ConfigService) {
    this.apiKey = config.get<string>('SENDGRID_API_KEY');
    this.fromEmail = config.get<string>('SENDGRID_FROM_EMAIL');
    if (this.apiKey) {
      sgMail.setApiKey(this.apiKey);
    }
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey && this.fromEmail);
  }

  async send(args: NotificationSendArgs): Promise<AdapterResult> {
    if (!this.isConfigured()) {
      this.logger.log(
        `[stub-email] to=${args.recipient} subject="${args.subject}" body=${args.body.length}chars`,
      );
      return { ok: true, skipped: true };
    }
    try {
      const [res] = await sgMail.send({
        to: args.recipient,
        from: this.fromEmail!,
        subject: args.subject,
        text: args.body,
      });
      return {
        ok: true,
        providerMessageId: res.headers['x-message-id'] as string | undefined,
      };
    } catch (err) {
      return { ok: false, error: extractError(err) };
    }
  }
}

function extractError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
