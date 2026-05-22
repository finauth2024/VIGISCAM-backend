import { Module } from '@nestjs/common';
import { RegistryAdminController } from './registry-admin.controller';
import { RegistryController } from './registry.controller';
import { RegistryService } from './registry.service';

@Module({
  controllers: [RegistryController, RegistryAdminController],
  providers: [RegistryService],
  exports: [RegistryService],
})
export class RegistryModule {}
