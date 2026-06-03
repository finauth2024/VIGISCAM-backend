import { Injectable, Logger } from '@nestjs/common';
import { NotificationChannel } from '@prisma/client';
import { createHash } from 'crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { QueueService } from '../../common/queue/queue.service';
import { QUEUE_NAMES } from '../../common/queue/queue-names';
import { ChannelAdapter, NotificationSendArgs } from './adapters/adapter.types';
import { EmailAdapter } from './adapters/email.adapter';
import { InAppAdapter } from './adapters/in-app.adapter';
import { PushAdapter } from './adapters/push.adapter';
import { SmsAdapter } from './adapters/sms.adapter';
import { WebsocketAdapter } from './adapters/websocket.adapter';

export interface SendNotificationInput extends NotificationSendArgs {
  channel: NotificationChannel;
  tenantId?: string | null;
  userId?: string | null;
  templateKey: string;
  /** CP-9 — link the delivery to the risk event / evidence that triggered it. */
  relatedRiskEventId?: string | null;
  relatedEvidenceId?: string | null;
}

const KEBAB_TO_CHANNEL: Record<string, NotificationChannel> = {
  email: 'EMAIL',
  sms: 'SMS',
  push: 'PUSH',
  'in-app': 'IN_APP',
  websocket: 'WEBSOCKET',
};

/**
 * Public API for Phase 9 modules (Guardian Pause, ScamHold, trusted-contact
 * review, etc.). Modules call `notifications.send(...)` with a channel +
 * recipient + body; the service picks the right adapter, writes a
 * NotificationDelivery row, and (on failure) re-enqueues via BullMQ.
 *
 * Synchronous semantics — callers see the immediate result and can decide
 * whether to surface a UI error. Background retry is handled by a future
 * BullMQ worker on the notification-delivery queue (added with 9H, where
 * the trusted-contact review workflow needs at-least-once delivery).
 */
@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);
  private readonly adapters: Record<NotificationChannel, ChannelAdapter>;

  constructor(
    email: EmailAdapter,
    sms: SmsAdapter,
    push: PushAdapter,
    inApp: InAppAdapter,
    websocket: WebsocketAdapter,
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
  ) {
    this.adapters = {
      EMAIL: email,
      SMS: sms,
      PUSH: push,
      IN_APP: inApp,
      WEBSOCKET: websocket,
    };
  }

  async send(input: SendNotificationInput): Promise<{ deliveryId: string }> {
    const payloadDigest = createHash('sha256')
      .update(`${input.templateKey}|${input.recipient}|${input.body}`)
      .digest('hex');

    // Open the delivery row up-front so even a crash mid-send leaves a
    // PENDING trail visible in the admin/observability UI.
    const delivery = await this.prisma.notificationDelivery.create({
      data: {
        tenantId: input.tenantId ?? null,
        userId: input.userId ?? null,
        channel: input.channel,
        recipient: input.recipient,
        templateKey: input.templateKey,
        payloadDigest,
        attempts: 0,
        relatedRiskEventId: input.relatedRiskEventId ?? null,
        relatedEvidenceId: input.relatedEvidenceId ?? null,
      },
    });

    const res = await this.attemptDelivery(delivery.id, input.channel, {
      recipient: input.recipient,
      subject: input.subject,
      body: input.body,
      metadata: input.metadata,
    });

    if (!res.ok && !res.skipped) {
      // Enqueue a background retry. The NotificationRetryWorker reloads the
      // row and re-attempts via BullMQ's exponential backoff (3 attempts).
      await this.queue.enqueue(
        QUEUE_NAMES.NotificationDelivery,
        {
          deliveryId: delivery.id,
          tenantId: input.tenantId ?? null,
          channel: this.toQueueChannel(input.channel),
          recipient: input.recipient,
          templateKey: input.templateKey,
          subject: input.subject,
          body: input.body,
          variables: input.metadata,
        },
        { jobId: `retry:${delivery.id}` },
      );
      this.logger.warn(`Notification ${delivery.id} failed (${res.error}); enqueued for retry`);
    }

    return { deliveryId: delivery.id };
  }

  /**
   * CP-9 — send via the channel adapter and record the outcome on the delivery
   * row (status, attempt count, failure reason, sentAt). Shared by the initial
   * send() and the retry worker.
   */
  async attemptDelivery(
    deliveryId: string,
    channel: NotificationChannel,
    args: NotificationSendArgs,
  ): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
    const adapter = this.adapters[channel];
    const res = await adapter.send(args);
    await this.prisma.notificationDelivery.update({
      where: { id: deliveryId },
      data: {
        status: res.ok ? (res.skipped ? 'SKIPPED' : 'SENT') : 'FAILED',
        attempts: { increment: 1 },
        lastError: res.error ?? null,
        providerMessageId: res.providerMessageId ?? null,
        sentAt: res.ok && !res.skipped ? new Date() : undefined,
      },
    });
    return { ok: res.ok, skipped: res.skipped, error: res.error };
  }

  /**
   * CP-9 — retry entry point for the BullMQ worker. Re-attempts the delivery;
   * THROWS on failure so BullMQ applies its backoff + attempt cap. After the
   * final attempt the job lands in the failed set and the row stays FAILED.
   */
  async retryFromQueue(payload: {
    deliveryId: string;
    channel: 'email' | 'sms' | 'push' | 'in-app' | 'websocket';
    recipient: string;
    subject: string;
    body: string;
    variables?: Record<string, unknown>;
  }): Promise<void> {
    const channel = KEBAB_TO_CHANNEL[payload.channel];
    const res = await this.attemptDelivery(payload.deliveryId, channel, {
      recipient: payload.recipient,
      subject: payload.subject,
      body: payload.body,
      metadata: payload.variables,
    });
    if (!res.ok && !res.skipped) {
      throw new Error(`delivery ${payload.deliveryId} still failing: ${res.error ?? 'unknown'}`);
    }
  }

  /** CP-9 — mark an in-app notification read. */
  async markRead(deliveryId: string, userId: string): Promise<void> {
    await this.prisma.notificationDelivery.updateMany({
      where: { id: deliveryId, userId },
      data: { readAt: new Date() },
    });
  }

  /** Bridge between Prisma's UPPER_SNAKE enum and the queue payload's kebab vocabulary. */
  private toQueueChannel(
    c: NotificationChannel,
  ): 'email' | 'sms' | 'push' | 'in-app' | 'websocket' {
    const map: Record<NotificationChannel, 'email' | 'sms' | 'push' | 'in-app' | 'websocket'> = {
      EMAIL: 'email',
      SMS: 'sms',
      PUSH: 'push',
      IN_APP: 'in-app',
      WEBSOCKET: 'websocket',
    };
    return map[c];
  }
}
