import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/** The terminal outcomes a reviewer can record on an appeal (PDF §27). */
export enum AppealDecision {
  ACCEPTED = 'ACCEPTED',
  REJECTED = 'REJECTED',
}

/**
 * A compliance reviewer's decision on a registry appeal. An ACCEPTED appeal
 * may also unpublish the contested entry when `unpublishEntry` is set — useful
 * for REMOVAL / OWNERSHIP_DISPUTE outcomes.
 */
export class DecideRegistryAppealDto {
  @ApiProperty({ enum: AppealDecision })
  @IsEnum(AppealDecision)
  decision!: AppealDecision;

  @ApiProperty({ description: 'Reviewer rationale — internal, never public.' })
  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  reviewNotes!: string;

  @ApiProperty({ required: false, description: 'Public-safe description of the resolution.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  resolutionAction?: string;

  @ApiProperty({
    required: false,
    default: false,
    description: 'Also remove the contested entry from the public registry if it is published.',
  })
  @IsOptional()
  @IsBoolean()
  unpublishEntry?: boolean;
}
