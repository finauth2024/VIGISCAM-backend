/**
 * Common adapter contract — every channel implementation conforms to this
 * so the NotificationService can swap them out and write a uniform
 * delivery row regardless of channel.
 */
export interface NotificationSendArgs {
  /** Channel-specific recipient: email address, E.164 phone, FCM token, user id. */
  recipient: string;
  /** Logical message — `subject` / `body` are channel-agnostic. */
  subject: string;
  body: string;
  /** Optional per-call metadata that adapters can use (e.g. SMS shortcode opts). */
  metadata?: Record<string, unknown>;
}

export interface AdapterResult {
  /** True iff the upstream provider accepted the send. */
  ok: boolean;
  /** Provider-side message id (for follow-up reconciliation). */
  providerMessageId?: string;
  /** When the call failed — used to populate `lastError` on the delivery row. */
  error?: string;
  /** True when the channel is unconfigured and the send was logged-only. */
  skipped?: boolean;
}

export interface ChannelAdapter {
  /** Constant — used in logs + the delivery row's `channel` column. */
  readonly channel: 'EMAIL' | 'SMS' | 'PUSH' | 'IN_APP' | 'WEBSOCKET';
  /** True when env credentials are present. Drives `SENT` vs `SKIPPED`. */
  isConfigured(): boolean;
  send(args: NotificationSendArgs): Promise<AdapterResult>;
}
