import { ApiProperty } from '@nestjs/swagger';
import { GiftCardGuardImpersonationType } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Min,
} from 'class-validator';

export class ScanGiftCardDto {
  @ApiProperty({
    required: false,
    description: 'Card brand if known (e.g. "Amazon", "Apple", "Steam").',
  })
  @IsOptional()
  @IsString()
  cardBrand?: string;

  @ApiProperty({
    required: false,
    description: 'Card face value in smallest currency unit (cents).',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  denominationMinor?: number;

  @ApiProperty({ required: false, default: 'USD' })
  @IsOptional()
  @IsString()
  @Length(3, 8)
  currency?: string;

  @ApiProperty({
    required: false,
    description: 'Caller asked the user to scratch / read out the redemption code.',
  })
  @IsOptional()
  @IsBoolean()
  codeRevealRequested?: boolean;

  @ApiProperty({
    required: false,
    description: 'Caller asked the user to send a photo of the redemption code.',
  })
  @IsOptional()
  @IsBoolean()
  photoOfCodeRequested?: boolean;

  @ApiProperty({
    required: false,
    enum: GiftCardGuardImpersonationType,
    description: 'Who the caller claimed to be, if a recognized pattern.',
  })
  @IsOptional()
  @IsEnum(GiftCardGuardImpersonationType)
  impersonationType?: GiftCardGuardImpersonationType;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  urgencyDetected?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  secrecyDetected?: boolean;

  @ApiProperty({
    required: false,
    description: 'Elder Mode flag from the family-module profile (9H wires the live read).',
  })
  @IsOptional()
  @IsBoolean()
  elderModeActive?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
