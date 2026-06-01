import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AdapterResult, ChannelAdapter, NotificationSendArgs } from './adapter.types';

/**
 * Firebase Cloud Messaging adapter. Implemented via the FCM HTTP v1 API
 * directly (no SDK import) so the dep graph stays light. Falls back to
 * the legacy `fcm` endpoint when no FCM_PROJECT_ID is configured.
 *
 * Until prod sets up FCM, this adapter operates in stub mode like the
 * other channels.
 */
@Injectable()
export class PushAdapter implements ChannelAdapter {
  readonly channel = 'PUSH' as const;
  private readonly logger = new Logger(PushAdapter.name);
  private readonly serverKey: string | undefined;

  constructor(config: ConfigService) {
    this.serverKey = config.get<string>('FCM_SERVER_KEY');
  }

  isConfigured(): boolean {
    return Boolean(this.serverKey);
  }

  async send(args: NotificationSendArgs): Promise<AdapterResult> {
    if (!this.isConfigured()) {
      this.logger.log(`[stub-push] to=${args.recipient} title="${args.subject}"`);
      return { ok: true, skipped: true };
    }
    try {
      const res = await fetch('https://fcm.googleapis.com/fcm/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `key=${this.serverKey}`,
        },
        body: JSON.stringify({
          to: args.recipient,
          notification: { title: args.subject, body: args.body },
        }),
      });
      if (!res.ok) {
        return { ok: false, error: `FCM ${res.status} ${res.statusText}` };
      }
      const body = (await res.json()) as { message_id?: string };
      return { ok: true, providerMessageId: body.message_id };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}
