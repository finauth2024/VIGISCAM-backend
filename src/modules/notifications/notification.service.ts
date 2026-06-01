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
}

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
    const adapter = this.adapters[input.channel];
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
      },
    });

    const res = await adapter.send({
      recipient: input.recipient,
      subject: input.subject,
      body: input.body,
      metadata: input.metadata,
    });

    await this.prisma.notificationDelivery.update({
      where: { id: delivery.id },
      data: {
        status: res.ok ? (res.skipped ? 'SKIPPED' : 'SENT') : 'FAILED',
        attempts: { increment: 1 },
        lastError: res.error ?? null,
        providerMessageId: res.providerMessageId ?? null,
        sentAt: res.ok && !res.skipped ? new Date() : null,
      },
    });

    if (!res.ok) {
      // Enqueue a background retry. The notification-delivery queue worker
      // (added in 9H) reloads the row and calls send() again with backoff.
      await this.queue.enqueue(
        QUEUE_NAMES.NotificationDelivery,
        {
          tenantId: input.tenantId ?? null,
          channel: this.toQueueChannel(input.channel),
          recipient: input.recipient,
          templateKey: input.templateKey,
          variables: input.metadata,
        },
        { jobId: `retry:${delivery.id}` },
      );
      this.logger.warn(`Notification ${delivery.id} failed (${res.error}); enqueued for retry`);
    }

    return { deliveryId: delivery.id };
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
