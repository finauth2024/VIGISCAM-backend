import { ApiProperty } from '@nestjs/swagger';
import { WalletNetwork, WalletReputation } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class CheckWalletDto {
  @ApiProperty({ enum: WalletNetwork })
  @IsEnum(WalletNetwork)
  network!: WalletNetwork;

  @ApiProperty({ description: 'The wallet address as the user typed/pasted it.' })
  @IsString()
  address!: string;

  @ApiProperty({
    required: false,
    enum: WalletReputation,
    description: 'Pre-computed reputation from upstream OSINT / WalletGuard cache.',
  })
  @IsOptional()
  @IsEnum(WalletReputation)
  reputation?: WalletReputation;

  @ApiProperty({
    required: false,
    description: 'The agent observed the clipboard value change between copy and paste.',
  })
  @IsOptional()
  @IsBoolean()
  clipboardSwapDetected?: boolean;

  @ApiProperty({
    required: false,
    description: 'The session destination changed from an earlier value.',
  })
  @IsOptional()
  @IsBoolean()
  walletSwitched?: boolean;

  @ApiProperty({
    required: false,
    description: '0-100 Identity Collision Graph cluster-match score (Phase 9G).',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  graphMatchScore?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  urgencyDetected?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  secrecyDetected?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
