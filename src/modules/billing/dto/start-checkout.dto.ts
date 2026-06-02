import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsUrl } from 'class-validator';
import { BillingPlan, PURCHASABLE_PLANS } from '../../../common/billing/billing-plans';

/** Only purchasable products are valid here — FREE needs no checkout. */
export class StartCheckoutDto {
  @ApiProperty({ enum: PURCHASABLE_PLANS, example: 'BASIC' })
  @IsIn(PURCHASABLE_PLANS)
  plan!: BillingPlan;

  @ApiPropertyOptional({ description: 'Where Stripe returns the user after success.' })
  @IsOptional()
  @IsUrl({ require_tld: false })
  successUrl?: string;

  @ApiPropertyOptional({ description: 'Where Stripe returns the user on cancel.' })
  @IsOptional()
  @IsUrl({ require_tld: false })
  cancelUrl?: string;
}
