import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { BILLING_PLANS, BillingPlan } from '../../../common/billing/billing-plans';

/**
 * Enterprise contract billing — an internal admin marks a tenant as
 * billed by manual invoice (no Stripe card). The plan is granted
 * directly; status becomes MANUAL.
 */
export class SetManualInvoiceDto {
  @ApiProperty({ enum: BILLING_PLANS, example: 'PREMIUM_SHIELD' })
  @IsIn(BILLING_PLANS)
  plan!: BillingPlan;

  @ApiPropertyOptional({ description: 'Contract reference / audit note.', maxLength: 2_000 })
  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  note?: string;
}
