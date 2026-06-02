import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PartnerApiKeyPlan } from '@prisma/client';
import { IsEnum, IsOptional, IsUrl } from 'class-validator';

/** Only purchasable tiers are valid here — FREE needs no checkout. */
export class StartCheckoutDto {
  @ApiProperty({ enum: ['PRO', 'ENTERPRISE'] })
  @IsEnum(PartnerApiKeyPlan)
  plan!: PartnerApiKeyPlan;

  @ApiPropertyOptional({ description: 'Where Stripe returns the user after success.' })
  @IsOptional()
  @IsUrl({ require_tld: false })
  successUrl?: string;

  @ApiPropertyOptional({ description: 'Where Stripe returns the user on cancel.' })
  @IsOptional()
  @IsUrl({ require_tld: false })
  cancelUrl?: string;
}
