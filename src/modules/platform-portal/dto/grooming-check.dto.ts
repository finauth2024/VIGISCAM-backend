import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { GroomingAgeGapSignal } from '../grooming.scorer';

const AGE_GAPS: GroomingAgeGapSignal[] = [
  'UNKNOWN',
  'AGES_BOTH_VERIFIED_ADULT',
  'AGE_GAP_SMALL',
  'AGE_GAP_MODERATE',
  'AGE_GAP_LARGE',
  'ADULT_TO_SUSPECTED_MINOR',
];

export class GroomingCheckDto {
  @ApiProperty({ enum: AGE_GAPS })
  @IsEnum(AGE_GAPS as unknown as object)
  ageGapSignal!: GroomingAgeGapSignal;

  @ApiPropertyOptional({
    description: 'How long the two parties have been talking, in days.',
    minimum: 0,
    maximum: 36_500,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(36_500)
  relationshipDurationDays?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  loveBombingDetected?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isolationLanguageDetected?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  paymentRequestDetected?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  photoSolicitationDetected?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  moveToPrivateChannelDetected?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  piiEscalationDetected?: boolean;

  @ApiPropertyOptional({
    description:
      'Upstream classifier verdict that the subject is a suspected minor. Triggers hard-stop rules.',
  })
  @IsOptional()
  @IsBoolean()
  minorSuspected?: boolean;

  @ApiPropertyOptional({
    description:
      'Platform-internal reference (e.g. masked conversation id). Not validated as PII; must not include message content.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  subjectReference?: string;
}
