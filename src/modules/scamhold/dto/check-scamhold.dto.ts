import { ApiProperty } from '@nestjs/swagger';
import { ScamHoldTransactionType } from '@prisma/client';
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

export class CheckScamHoldDto {
  @ApiProperty({ enum: ScamHoldTransactionType })
  @IsEnum(ScamHoldTransactionType)
  transactionType!: ScamHoldTransactionType;

  @ApiProperty({
    description:
      'Amount in the smallest currency unit (cents, satoshis). Avoids float arithmetic on money.',
  })
  @IsInt()
  @Min(0)
  amountMinor!: number;

  @ApiProperty({ default: 'USD' })
  @IsString()
  @Length(3, 8)
  currency!: string;

  @ApiProperty({
    description: 'Recipient identifier (address / handle / account #). Stored as-is.',
  })
  @IsString()
  recipient!: string;

  @ApiProperty({
    required: false,
    enum: ['UNKNOWN', 'NEW', 'KNOWN_RISKY', 'SUSPICIOUS_WALLET'],
    description: 'Pre-computed reputation tag from upstream OSINT / WalletGuard.',
  })
  @IsOptional()
  @IsString()
  recipientRisk?: 'UNKNOWN' | 'NEW' | 'KNOWN_RISKY' | 'SUSPICIOUS_WALLET';

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
  @IsBoolean()
  activeCommunication?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
