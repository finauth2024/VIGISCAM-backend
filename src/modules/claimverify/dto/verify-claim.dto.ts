import { ApiProperty } from '@nestjs/swagger';
import { ClaimVerifyType } from '@prisma/client';
import { IsBoolean, IsEnum, IsInt, IsObject, IsOptional, Max, Min } from 'class-validator';

export class VerifyClaimDto {
  @ApiProperty({ enum: ClaimVerifyType, description: '16-value claim category (brief §1115).' })
  @IsEnum(ClaimVerifyType)
  claimType!: ClaimVerifyType;

  @ApiProperty({
    description:
      'Free-form payload: name, email, phone, organization, website, location, claim narrative.',
  })
  @IsObject()
  subject!: Record<string, unknown>;

  @ApiProperty({
    required: false,
    description: 'Whois-derived age in days. Null when no domain or no lookup yet.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  domainAgeDays?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  locationMismatch?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  imageReuseDetected?: boolean;

  @ApiProperty({
    required: false,
    description: '0-100 from upstream A1SCAMSHIELD NLP pass on the claim narrative.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  scamPhraseScore?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  paymentPressure?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  secrecyDetected?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  urgencyDetected?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
