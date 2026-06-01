import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

/** Terminal outcomes for a wallet check (subset of WalletGuardDecision). */
export enum WalletGuardUserDecision {
  VALIDATED = 'VALIDATED',
  BLOCKED = 'BLOCKED',
  ESCALATED_TO_TRUSTED_CONTACT = 'ESCALATED_TO_TRUSTED_CONTACT',
  CONTINUED_ANYWAY = 'CONTINUED_ANYWAY',
}

export class DecideWalletDto {
  @ApiProperty({ enum: WalletGuardUserDecision })
  @IsEnum(WalletGuardUserDecision)
  decision!: WalletGuardUserDecision;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
