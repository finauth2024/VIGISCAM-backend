import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export enum BankCaseReviewDecision {
  ALLOW = 'ALLOW',
  BLOCK = 'BLOCK',
  NEED_MORE_INFO = 'NEED_MORE_INFO',
  ESCALATE_TO_FRAUD = 'ESCALATE_TO_FRAUD',
  CONTACT_CUSTOMER = 'CONTACT_CUSTOMER',
}

/**
 * Bank-side professional opinion on an escalated ScamHold case.
 *
 * The bank's opinion does not auto-release or auto-block the customer's
 * transaction — the customer still owns that decision via the ScamHold
 * `/:id/decision` endpoint. The bank's review is recorded as
 * `bank_case_reviews` and surfaced to the family/protected user so they
 * can weight it against other inputs.
 */
export class ReviewCaseDto {
  @ApiProperty({ enum: BankCaseReviewDecision })
  @IsEnum(BankCaseReviewDecision)
  decision!: BankCaseReviewDecision;

  @ApiPropertyOptional({ description: 'Free-text rationale, audit-visible.' })
  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  notes?: string;
}
