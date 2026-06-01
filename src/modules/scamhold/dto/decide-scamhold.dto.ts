import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

/** Terminal outcomes a user (or the system) can record. Matches brief §1077. */
export enum ScamHoldDecision {
  RELEASE_AFTER_VERIFICATION = 'RELEASE_AFTER_VERIFICATION',
  BLOCK = 'BLOCK',
  SEND_TO_TRUSTED_CONTACT = 'SEND_TO_TRUSTED_CONTACT',
  SAVE_ONLY = 'SAVE_ONLY',
  CONTINUE_ANYWAY = 'CONTINUE_ANYWAY',
}

export class DecideScamHoldDto {
  @ApiProperty({ enum: ScamHoldDecision })
  @IsEnum(ScamHoldDecision)
  decision!: ScamHoldDecision;

  @ApiProperty({
    required: false,
    description: 'Optional context (e.g. verification method, escalation reason).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
