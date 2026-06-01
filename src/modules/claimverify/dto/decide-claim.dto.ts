import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

/** Terminal outcomes for a claim verification (subset of ClaimVerifyDecision). */
export enum ClaimVerifyUserDecision {
  TRUSTED = 'TRUSTED',
  REJECTED = 'REJECTED',
  ESCALATED_TO_TRUSTED_CONTACT = 'ESCALATED_TO_TRUSTED_CONTACT',
  CONTINUED_ANYWAY = 'CONTINUED_ANYWAY',
}

export class DecideClaimDto {
  @ApiProperty({ enum: ClaimVerifyUserDecision })
  @IsEnum(ClaimVerifyUserDecision)
  decision!: ClaimVerifyUserDecision;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
