import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';

/**
 * Partial update of the user's ProtectionSettings. All fields optional so the
 * frontend can toggle a single switch. `highRiskAmountThresholdMinor` is a
 * number on the wire (cents) and coerced to BigInt in the service.
 */
export class UpdateProtectionSettingsDto {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() scamHoldEnabled?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() guardianPauseEnabled?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() giftCardGuardEnabled?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() walletGuardEnabled?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() claimVerifyEnabled?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() scamMirrorEnabled?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() identityGraphEnabled?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() evidenceAutoSaveEnabled?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() trustedContactRequired?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() elderModeStrictLock?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() allowContinueAnyway?: boolean;

  @ApiPropertyOptional({ description: 'Smallest currency unit (cents).' })
  @IsOptional()
  @IsInt()
  @Min(0)
  highRiskAmountThresholdMinor?: number;

  @ApiPropertyOptional({ minimum: 5, maximum: 600 })
  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(600)
  guardianPauseDurationSeconds?: number;
}
