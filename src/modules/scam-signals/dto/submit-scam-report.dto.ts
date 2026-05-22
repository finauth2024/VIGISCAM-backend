import { ApiProperty } from '@nestjs/swagger';
import { IndicatorType } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class SubmitScamReportDto {
  @ApiProperty({ enum: IndicatorType, example: 'PHONE' })
  @IsEnum(IndicatorType)
  indicatorType!: IndicatorType;

  @ApiProperty({ example: '(555) 123-4567' })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  indicatorValue!: string;

  @ApiProperty({ required: false, example: 'GIFT_CARD_SCAM', description: 'Scam category code.' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  category?: string;

  @ApiProperty({ required: false, description: 'What happened, in the reporter’s words.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiProperty({ required: false, description: 'Raw message / transcript text.' })
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  rawText?: string;

  @ApiProperty({ required: false, example: 'US' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  geography?: string;
}
