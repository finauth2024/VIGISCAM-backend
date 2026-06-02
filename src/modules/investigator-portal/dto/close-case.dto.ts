import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export enum CaseDisposition {
  CONFIRMED_SCAM = 'CONFIRMED_SCAM',
  UNFOUNDED = 'UNFOUNDED',
  REFERRED_TO_AGENCY = 'REFERRED_TO_AGENCY',
  REFERRED_TO_PLATFORM = 'REFERRED_TO_PLATFORM',
  INSUFFICIENT_EVIDENCE = 'INSUFFICIENT_EVIDENCE',
  DUPLICATE = 'DUPLICATE',
  OTHER = 'OTHER',
}

export class CloseCaseDto {
  @ApiProperty({ enum: CaseDisposition })
  @IsEnum(CaseDisposition)
  disposition!: CaseDisposition;

  @ApiPropertyOptional({ description: 'Audit-visible closing rationale.', maxLength: 4_000 })
  @IsOptional()
  @IsString()
  @MaxLength(4_000)
  notes?: string;
}
