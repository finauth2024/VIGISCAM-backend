import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

/** Terminal outcomes a user (or the system, on expiry) can record. */
export enum PauseResolution {
  RESOLVED = 'RESOLVED',
  CONTINUED_ANYWAY = 'CONTINUED_ANYWAY',
  EXPIRED = 'EXPIRED',
}

export class CompletePauseDto {
  @ApiProperty({ enum: PauseResolution })
  @IsEnum(PauseResolution)
  resolution!: PauseResolution;

  @ApiProperty({
    required: false,
    description: 'Optional user-facing note (e.g. why they continued).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
