import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Sidecar fields that ride alongside the multipart file. The file
 * itself is parsed via NestJS's FileInterceptor and is not part of
 * this DTO.
 */
export class UploadEvidenceFileDto {
  @ApiProperty({
    required: false,
    description:
      'ISO date after which the file may be purged. Null = follow tenant default policy.',
  })
  @IsOptional()
  @IsDateString()
  retentionUntil?: string;

  @ApiProperty({
    required: false,
    default: false,
    description: 'Mark the file as under legal hold — exempt from retention purges until lifted.',
  })
  @IsOptional()
  @IsBoolean()
  legalHold?: boolean;

  @ApiProperty({
    required: false,
    description: 'Free-form JSON metadata (case id, investigator note, etc).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  metadata?: string;
}
