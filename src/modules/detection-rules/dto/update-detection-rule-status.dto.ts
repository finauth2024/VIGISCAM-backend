import { ApiProperty } from '@nestjs/swagger';
import { DetectionRuleStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Moves a rule to a new lifecycle state. The service validates the transition
 * (no DRAFT -> ACTIVE; RETIRED is terminal) and gates ACTIVE transitions on
 * admin / compliance role.
 */
export class UpdateDetectionRuleStatusDto {
  @ApiProperty({ enum: DetectionRuleStatus, description: 'The target status.' })
  @IsEnum(DetectionRuleStatus)
  status!: DetectionRuleStatus;

  @ApiProperty({ required: false, description: 'Reviewer rationale, recorded in evidence.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;
}
