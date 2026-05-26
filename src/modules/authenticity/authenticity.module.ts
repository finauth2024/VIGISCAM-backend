import { Module } from '@nestjs/common';
import { AuthenticityClient } from './authenticity.client';
import { AuthenticityController } from './authenticity.controller';
import { AuthenticityService } from './authenticity.service';

@Module({
  controllers: [AuthenticityController],
  providers: [AuthenticityClient, AuthenticityService],
  exports: [AuthenticityService],
})
export class AuthenticityModule {}
