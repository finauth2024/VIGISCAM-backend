import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

/** The decisions a reviewer can make on a scam signal (PDF §16.2). */
export enum ReviewDecision {
  MARK_UNDER_REVIEW = 'MARK_UNDER_REVIEW',
  MARK_HIGH_RISK = 'MARK_HIGH_RISK',
  PROMOTE_TO_VERIFIED = 'PROMOTE_TO_VERIFIED',
  REJECT = 'REJECT',
  ARCHIVE = 'ARCHIVE',
}

export class ReviewSignalDto {
  @ApiProperty({ enum: ReviewDecision })
  @IsEnum(ReviewDecision)
  decision!: ReviewDecision;

  @ApiProperty({ required: false, description: 'Reviewer notes (internal — never public).' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
