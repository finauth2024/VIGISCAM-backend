import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

/** Terminal outcomes for a gift-card warning (subset of GiftCardGuardDecision). */
export enum GiftCardGuardUserDecision {
  AVOIDED = 'AVOIDED',
  CONTINUED_ANYWAY = 'CONTINUED_ANYWAY',
  ESCALATED_TO_TRUSTED_CONTACT = 'ESCALATED_TO_TRUSTED_CONTACT',
}

export class DecideGiftCardDto {
  @ApiProperty({ enum: GiftCardGuardUserDecision })
  @IsEnum(GiftCardGuardUserDecision)
  decision!: GiftCardGuardUserDecision;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
