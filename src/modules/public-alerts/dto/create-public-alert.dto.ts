import { ApiProperty } from '@nestjs/swagger';
import { PublicAlertSeverity } from '@prisma/client';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreatePublicAlertDto {
  @ApiProperty({ description: 'Short headline shown to the public.' })
  @IsString()
  @MinLength(5)
  @MaxLength(200)
  title!: string;

  @ApiProperty({ description: 'The alert body. Public-safe language; identity accusations are rejected.' })
  @IsString()
  @MinLength(20)
  @MaxLength(5000)
  body!: string;

  @ApiProperty({ description: 'Region code (ISO country code or operator-defined region label).' })
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  region!: string;

  @ApiProperty({ enum: PublicAlertSeverity, required: false, default: 'WARNING' })
  @IsOptional()
  @IsEnum(PublicAlertSeverity)
  severity?: PublicAlertSeverity;

  @ApiProperty({ required: false, description: 'Optional scam category this alert relates to.' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  category?: string;

  @ApiProperty({
    required: false,
    type: [String],
    description: 'Underlying verified registry entry ids that back this alert.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('all', { each: true })
  registryEntryIds?: string[];

  @ApiProperty({ required: false, description: 'Optional auto-expiry time (ISO).' })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}
