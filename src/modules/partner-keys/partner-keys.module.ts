import { Module } from '@nestjs/common';
import { ApiKeyGuard } from '../../common/auth/api-key.guard';
import { PartnerKeyController } from './partner-key.controller';
import { PartnerKeyService } from './partner-key.service';

/**
 * Partner-key management + the partner authentication guard. Exports both so
 * partner-facing modules (Phase 5B+) can `@UseGuards(ApiKeyGuard)` to opt
 * into X-API-Key authentication.
 */
@Module({
  controllers: [PartnerKeyController],
  providers: [PartnerKeyService, ApiKeyGuard],
  exports: [PartnerKeyService, ApiKeyGuard],
})
export class PartnerKeysModule {}
