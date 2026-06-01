import { Module } from '@nestjs/common';
import { BankTenantGuard } from '../../common/auth/bank-tenant.guard';
import { BankPortalController } from './bank-portal.controller';
import { BankPortalService } from './bank-portal.service';

/**
 * Phase 10B — BankGuard portal backend.
 *
 * EvidenceService is provided globally (EvidenceModule is @Global),
 * so this module does not need to import it explicitly.
 */
@Module({
  controllers: [BankPortalController],
  providers: [BankPortalService, BankTenantGuard],
})
export class BankPortalModule {}
