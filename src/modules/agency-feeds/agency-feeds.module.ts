import { Module } from '@nestjs/common';
import { PartnerKeysModule } from '../partner-keys/partner-keys.module';
import { AgencyFeedAdminController } from './agency-feed-admin.controller';
import { AgencyFeedConsumerController } from './agency-feed-consumer.controller';
import { AgencyFeedService } from './agency-feed.service';

@Module({
  imports: [PartnerKeysModule],
  controllers: [AgencyFeedAdminController, AgencyFeedConsumerController],
  providers: [AgencyFeedService],
  exports: [AgencyFeedService],
})
export class AgencyFeedsModule {}
