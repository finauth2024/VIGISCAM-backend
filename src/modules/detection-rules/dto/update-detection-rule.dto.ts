import { ApiProperty } from '@nestjs/swagger';
import { RiskLevel } from '@prisma/client';
import { IsEnum, IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Edits a rule's authoring fields. The status field is NOT editable here —
 * use the status endpoint, which enforces the lifecycle transition rules.
 * ACTIVE and RETIRED rules cannot be edited (disable / re-test first).
 */
export class UpdateDetectionRuleDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  name?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  description?: string;

  @ApiProperty({ required: false, type: Object })
  @IsOptional()
  @IsObject()
  pattern?: Record<string, unknown>;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  category?: string;

  @ApiProperty({ enum: RiskLevel, required: false })
  @IsOptional()
  @IsEnum(RiskLevel)
  severity?: RiskLevel;
}
