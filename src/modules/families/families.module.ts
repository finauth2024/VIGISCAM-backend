import { Module } from '@nestjs/common';
import { GuardianshipController } from './guardianship.controller';
import { GuardianshipService } from './guardianship.service';
import { TrustedContactsController } from './trusted-contacts.controller';
import { TrustedContactsService } from './trusted-contacts.service';

@Module({
  controllers: [TrustedContactsController, GuardianshipController],
  providers: [TrustedContactsService, GuardianshipService],
  exports: [TrustedContactsService, GuardianshipService],
})
export class FamiliesModule {}
