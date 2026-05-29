import { ApiProperty } from '@nestjs/swagger';
import { IndicatorType } from '@prisma/client';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * Creates a cross-border agency feed. The tenant must be of an AGENCY-like
 * institutional type (validated by the service). The feed is created in
 * status ACTIVE.
 */
export class CreateAgencyFeedDto {
  @ApiProperty({ format: 'uuid', description: 'The agency tenant that owns the feed.' })
  @IsUUID()
  tenantId!: string;

  @ApiProperty({ description: 'Human label (e.g. "UK NCSC — Domain Phishing Feed").' })
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  name!: string;

  @ApiProperty({
    required: false,
    description:
      'Consuming jurisdiction label (ISO country / region). Audit only — not a query filter.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  region?: string;

  @ApiProperty({
    required: false,
    type: [String],
    description: 'Scam category codes the feed delivers. Empty = all categories.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  categories?: string[];

  @ApiProperty({
    required: false,
    enum: IndicatorType,
    isArray: true,
    description: 'Indicator types the feed delivers. Empty = all types.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsEnum(IndicatorType, { each: true })
  indicatorTypes?: IndicatorType[];
}
