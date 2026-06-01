import { Module } from '@nestjs/common';
import { PlatformTenantGuard } from '../../common/auth/platform-tenant.guard';
import { PlatformPortalController } from './platform-portal.controller';
import { PlatformPortalService } from './platform-portal.service';

@Module({
  controllers: [PlatformPortalController],
  providers: [PlatformPortalService, PlatformTenantGuard],
})
export class PlatformPortalModule {}
