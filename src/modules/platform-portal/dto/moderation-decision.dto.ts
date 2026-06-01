import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export enum PlatformModerationDecision {
  APPROVE_CONTENT = 'APPROVE_CONTENT',
  REMOVE_CONTENT = 'REMOVE_CONTENT',
  WARN_USER = 'WARN_USER',
  SUSPEND_USER = 'SUSPEND_USER',
  ESCALATE_TO_TRUST_AND_SAFETY = 'ESCALATE_TO_TRUST_AND_SAFETY',
  ESCALATE_TO_LAW_ENFORCEMENT = 'ESCALATE_TO_LAW_ENFORCEMENT',
}

export class ModerationDecisionDto {
  @ApiProperty({ enum: PlatformModerationDecision })
  @IsEnum(PlatformModerationDecision)
  decision!: PlatformModerationDecision;

  @ApiPropertyOptional({ description: 'Audit-visible rationale.' })
  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  notes?: string;
}
