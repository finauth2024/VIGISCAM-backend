import { Module } from '@nestjs/common';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { RegistryAdminController } from './registry-admin.controller';
import { RegistryAppealAdminController } from './registry-appeal-admin.controller';
import { RegistryAppealService } from './registry-appeal.service';
import { RegistryController } from './registry.controller';
import { RegistryService } from './registry.service';

@Module({
  imports: [WebhooksModule],
  controllers: [RegistryController, RegistryAdminController, RegistryAppealAdminController],
  providers: [RegistryService, RegistryAppealService],
  exports: [RegistryService, RegistryAppealService],
})
export class RegistryModule {}
