import { Module } from '@nestjs/common';
import { WebhookAdminController } from './webhook-admin.controller';
import { WebhookService } from './webhook.service';

@Module({
  controllers: [WebhookAdminController],
  providers: [WebhookService],
  exports: [WebhookService],
})
export class WebhooksModule {}
