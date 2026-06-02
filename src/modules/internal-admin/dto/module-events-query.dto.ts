import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

/**
 * The protection modules the internal oversight console can page through.
 * String enum kept in lockstep with the switch in OversightService —
 * adding a module means adding a case there and a value here.
 */
export enum OversightModule {
  GUARDIAN_PAUSE = 'GUARDIAN_PAUSE',
  SCAMHOLD = 'SCAMHOLD',
  GIFTCARDGUARD = 'GIFTCARDGUARD',
  WALLETGUARD = 'WALLETGUARD',
  CLAIMVERIFY = 'CLAIMVERIFY',
  SCAMMIRROR = 'SCAMMIRROR',
  TRUSTED_CONTACT_REVIEW = 'TRUSTED_CONTACT_REVIEW',
}

export class ModuleEventsQueryDto {
  @ApiProperty({ enum: OversightModule })
  @IsEnum(OversightModule)
  module!: OversightModule;

  @ApiPropertyOptional({ description: 'Restrict to a single tenant id.' })
  @IsOptional()
  @IsUUID()
  tenantId?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 200, default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}
