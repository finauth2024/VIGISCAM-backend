import { Module } from '@nestjs/common';
import { EnterpriseTenantGuard } from '../../common/auth/enterprise-tenant.guard';
import { EnterprisePortalController } from './enterprise-portal.controller';
import { EnterprisePortalService } from './enterprise-portal.service';

@Module({
  controllers: [EnterprisePortalController],
  providers: [EnterprisePortalService, EnterpriseTenantGuard],
})
export class EnterprisePortalModule {}
