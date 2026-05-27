import { Module } from '@nestjs/common';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { PublicAlertAdminController } from './public-alert-admin.controller';
import { PublicAlertPublicController } from './public-alert-public.controller';
import { PublicAlertService } from './public-alert.service';

@Module({
  imports: [WebhooksModule],
  controllers: [PublicAlertAdminController, PublicAlertPublicController],
  providers: [PublicAlertService],
  exports: [PublicAlertService],
})
export class PublicAlertsModule {}
