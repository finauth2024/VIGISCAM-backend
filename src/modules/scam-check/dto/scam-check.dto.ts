import { ApiProperty } from '@nestjs/swagger';
import { IndicatorType } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class ScamCheckDto {
  @ApiProperty({ enum: IndicatorType, example: 'PHONE' })
  @IsEnum(IndicatorType)
  indicatorType!: IndicatorType;

  @ApiProperty({ example: '+1 555 123 4567' })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  indicatorValue!: string;

  @ApiProperty({
    required: false,
    description: 'Message / transcript text to scan for scam language.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  rawText?: string;

  @ApiProperty({ required: false, default: false, description: 'Also file this as a scam report.' })
  @IsOptional()
  @IsBoolean()
  createReport?: boolean;
}
