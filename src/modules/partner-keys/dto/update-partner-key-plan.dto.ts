import { ApiProperty } from '@nestjs/swagger';
import { PartnerApiKeyPlan } from '@prisma/client';
import { IsEnum } from 'class-validator';

/** Re-tier an existing partner API key (Phase 7E). */
export class UpdatePartnerKeyPlanDto {
  @ApiProperty({ enum: PartnerApiKeyPlan })
  @IsEnum(PartnerApiKeyPlan)
  plan!: PartnerApiKeyPlan;
}
