import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PartnerApiKeyPlan } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Enterprise contract billing — an internal admin marks a tenant as
 * billed by manual invoice (no Stripe card). The plan is granted
 * directly; status becomes MANUAL.
 */
export class SetManualInvoiceDto {
  @ApiProperty({ enum: PartnerApiKeyPlan })
  @IsEnum(PartnerApiKeyPlan)
  plan!: PartnerApiKeyPlan;

  @ApiPropertyOptional({ description: 'Contract reference / audit note.', maxLength: 2_000 })
  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  note?: string;
}
