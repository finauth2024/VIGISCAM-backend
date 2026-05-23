import { ApiProperty } from '@nestjs/swagger';
import { DetectionRuleType, RiskLevel } from '@prisma/client';
import {
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * Creates a new detection rule. It always lands as DRAFT — the no-auto-
 * activation guardrail (PDF §33) is enforced both at the DB default and at
 * the transition layer (DRAFT cannot go directly to ACTIVE).
 */
export class CreateDetectionRuleDto {
  @ApiProperty({ description: 'Short human label for the rule.' })
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  name!: string;

  @ApiProperty({ description: 'What the rule looks for and why it matters.' })
  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  description!: string;

  @ApiProperty({ enum: DetectionRuleType, description: 'What kind of pattern this rule encodes.' })
  @IsEnum(DetectionRuleType)
  ruleType!: DetectionRuleType;

  @ApiProperty({
    description:
      'The pattern definition. Shape depends on ruleType (e.g. { phrases: ["safe account"] } for PHRASE_MATCH).',
    type: Object,
  })
  @IsObject()
  pattern!: Record<string, unknown>;

  @ApiProperty({ required: false, description: 'Scam category code this rule belongs to.' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  category?: string;

  @ApiProperty({ enum: RiskLevel, required: false, description: 'Risk level a match should raise.' })
  @IsOptional()
  @IsEnum(RiskLevel)
  severity?: RiskLevel;

  @ApiProperty({
    format: 'uuid',
    required: false,
    description: 'Optional cluster this rule was derived from (Phase 4C suggestions).',
  })
  @IsOptional()
  @IsUUID()
  sourceClusterId?: string;
}
