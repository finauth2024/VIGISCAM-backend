import { ApiProperty } from '@nestjs/swagger';
import { GuardianPauseRiskLevel, GuardianPauseTriggerType } from '@prisma/client';
import {
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class StartPauseDto {
  @ApiProperty({ enum: GuardianPauseRiskLevel })
  @IsEnum(GuardianPauseRiskLevel)
  riskLevel!: GuardianPauseRiskLevel;

  @ApiProperty({
    enum: GuardianPauseTriggerType,
    description: 'Which detection lit the pause. Tracks back to brief §1037 trigger list.',
  })
  @IsEnum(GuardianPauseTriggerType)
  triggerType!: GuardianPauseTriggerType;

  @ApiProperty({
    description:
      'Short, status-based public-safe summary shown to the user. Never raw report text.',
  })
  @IsString()
  @MinLength(4)
  @MaxLength(280)
  triggerSummary!: string;

  @ApiProperty({
    required: false,
    description: 'Pause duration in seconds (defaults to 30s).',
  })
  @IsOptional()
  @IsInt()
  @Min(5)
  durationSeconds?: number;

  @ApiProperty({
    required: false,
    description:
      'Anything the triggering module wants to record (transactionId, walletAddress, etc).',
  })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
