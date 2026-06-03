import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AIDecisionSource, ModelStatus } from '@prisma/client';
import { IsEnum, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class RegisterModelDto {
  @ApiProperty({ description: 'AIDecision.serviceKind this model serves, e.g. NLP_CLASSIFIER.' })
  @IsString()
  @MaxLength(120)
  serviceKind!: string;

  @ApiProperty({ example: 'dima806/deepfake_vs_real_image_detection' })
  @IsString()
  @MaxLength(200)
  modelName!: string;

  @ApiProperty({ example: 'authenticity-1.1.0' })
  @IsString()
  @MaxLength(80)
  version!: string;

  @ApiPropertyOptional({ enum: ModelStatus })
  @IsOptional()
  @IsEnum(ModelStatus)
  status?: ModelStatus;

  @ApiPropertyOptional({ enum: AIDecisionSource })
  @IsOptional()
  @IsEnum(AIDecisionSource)
  source?: AIDecisionSource;

  @ApiPropertyOptional({ type: Object, description: 'Evaluation metrics (accuracy, FNR, etc.).' })
  @IsOptional()
  @IsObject()
  metrics?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class SetModelStatusDto {
  @ApiProperty({ enum: ModelStatus })
  @IsEnum(ModelStatus)
  status!: ModelStatus;
}
