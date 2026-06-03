import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AIReviewerLabel } from '@prisma/client';
import { IsEnum, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class SubmitAiFeedbackDto {
  @ApiProperty({ enum: AIReviewerLabel, description: 'The reviewer verdict on the AI decision.' })
  @IsEnum(AIReviewerLabel)
  label!: AIReviewerLabel;

  @ApiPropertyOptional({ description: 'Reviewer notes.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiPropertyOptional({
    type: Object,
    description: 'The corrected output the model should have produced (training signal).',
  })
  @IsOptional()
  @IsObject()
  correctedOutput?: Record<string, unknown>;
}
