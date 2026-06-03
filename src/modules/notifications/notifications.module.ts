import { Global, Module } from '@nestjs/common';
import { EmailAdapter } from './adapters/email.adapter';
import { InAppAdapter } from './adapters/in-app.adapter';
import { PushAdapter } from './adapters/push.adapter';
import { SmsAdapter } from './adapters/sms.adapter';
import { WebsocketAdapter } from './adapters/websocket.adapter';
import { NotificationRetryWorker } from './notification-retry.worker';
import { NotificationService } from './notification.service';

/**
 * Global so Phase 9 modules can inject NotificationService directly.
 * The five adapters are providers because each one captures its own
 * provider client / config; NotificationService composes them. The
 * NotificationRetryWorker (CP-9) consumes the BullMQ retry queue.
 */
@Global()
@Module({
  providers: [
    EmailAdapter,
    SmsAdapter,
    PushAdapter,
    InAppAdapter,
    WebsocketAdapter,
    NotificationService,
    NotificationRetryWorker,
  ],
  exports: [NotificationService],
})
export class NotificationsModule {}
