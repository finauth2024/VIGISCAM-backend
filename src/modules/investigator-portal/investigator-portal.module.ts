import { Module } from '@nestjs/common';
import { InvestigatorTenantGuard } from '../../common/auth/investigator-tenant.guard';
import { InvestigatorPortalController } from './investigator-portal.controller';
import { InvestigatorPortalService } from './investigator-portal.service';

@Module({
  controllers: [InvestigatorPortalController],
  providers: [InvestigatorPortalService, InvestigatorTenantGuard],
})
export class InvestigatorPortalModule {}
