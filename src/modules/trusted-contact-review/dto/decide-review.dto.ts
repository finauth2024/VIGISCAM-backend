import { ApiProperty } from '@nestjs/swagger';
import { TrustedContactReviewDecision } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class DecideReviewDto {
  @ApiProperty({ enum: TrustedContactReviewDecision })
  @IsEnum(TrustedContactReviewDecision)
  decision!: TrustedContactReviewDecision;

  @ApiProperty({
    required: false,
    description: 'Optional rationale the user sees with the decision.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiProperty({
    required: false,
    description:
      'One-time token issued in the original notification email/SMS. Required when the caller is not a logged-in VIGISCAM user.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  decidedByContactToken?: string;
}
