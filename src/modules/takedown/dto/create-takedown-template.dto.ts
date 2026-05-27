import { ApiProperty } from '@nestjs/swagger';
import { TakedownProviderType } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateTakedownTemplateDto {
  @ApiProperty({ enum: TakedownProviderType })
  @IsEnum(TakedownProviderType)
  providerType!: TakedownProviderType;

  @ApiProperty({ description: 'Canonical provider name (e.g. "GoDaddy").' })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  providerName!: string;

  @ApiProperty({ description: 'Case-insensitive regex matched against OSINT-detected registrar / host name.' })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  detectorPattern!: string;

  @ApiProperty({ required: false, description: 'Abuse-handling contact (typically an email).' })
  @IsOptional()
  @IsString()
  @MaxLength(320)
  abuseContact?: string;

  @ApiProperty({
    description:
      'Request boilerplate with `{indicator}`, `{category}`, `{summary}` placeholders.',
  })
  @IsString()
  @MinLength(20)
  @MaxLength(3000)
  detailsTemplate!: string;

  @ApiProperty({ required: false, default: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiProperty({ required: false, default: 0, description: 'Higher priority wins when multiple templates match.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  priority?: number;
}
