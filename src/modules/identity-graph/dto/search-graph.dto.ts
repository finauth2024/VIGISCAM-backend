import { ApiProperty } from '@nestjs/swagger';
import { FraudGraphNodeType, IndicatorType } from '@prisma/client';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class SearchGraphDto {
  @ApiProperty({
    description:
      'Free-text query against label / normalizedIndicator. Case-insensitive contains-match.',
  })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  q!: string;

  @ApiProperty({
    required: false,
    enum: FraudGraphNodeType,
    isArray: true,
    description: 'Restrict to one or more node types.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsEnum(FraudGraphNodeType, { each: true })
  nodeTypes?: FraudGraphNodeType[];

  @ApiProperty({
    required: false,
    enum: IndicatorType,
    description: 'Restrict INDICATOR nodes to one indicator type.',
  })
  @IsOptional()
  @IsEnum(IndicatorType)
  indicatorType?: IndicatorType;

  @ApiProperty({ required: false, description: 'Max items (1-200, default 50).' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}
