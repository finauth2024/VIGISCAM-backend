import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsBoolean,
  MaxLength,
  Min,
} from 'class-validator';
import {
  TellerBehaviorSignal,
  TellerCustomerStatedReason,
  TellerRecipientType,
  TellerTransactionChannel,
} from '../teller-assist.scorer';

const CHANNELS: TellerTransactionChannel[] = [
  'INTERNAL_TRANSFER',
  'ACH',
  'WIRE_DOMESTIC',
  'WIRE_INTERNATIONAL',
  'CRYPTO_PURCHASE',
  'GIFT_CARD_PURCHASE',
  'CASH_WITHDRAWAL',
  'CHECK',
];

const RECIPIENT_TYPES: TellerRecipientType[] = [
  'EXISTING_PAYEE',
  'NEW_PAYEE',
  'FOREIGN_PAYEE',
  'BUSINESS_NEW',
  'CRYPTO_EXCHANGE',
  'PEER_TO_PEER_APP',
  'UNKNOWN',
];

const REASONS: TellerCustomerStatedReason[] = [
  'NONE_GIVEN',
  'PERSONAL_PAYMENT',
  'INVESTMENT_OPPORTUNITY',
  'GOVERNMENT_FEE_OR_FINE',
  'TECH_SUPPORT_FEE',
  'FAMILY_EMERGENCY',
  'ROMANTIC_PARTNER',
  'LOTTERY_OR_PRIZE_FEE',
  'BUSINESS_INVOICE',
  'CHARITY',
  'OTHER',
];

const BEHAVIORS: TellerBehaviorSignal[] = [
  'DISTRESSED',
  'CONFUSED',
  'ON_PHONE_DURING_TRANSACTION',
  'RECEIVING_INSTRUCTIONS_FROM_CALLER',
  'COACHED_RESPONSES',
  'REFUSED_TO_EXPLAIN',
  'FIRST_TIME_LARGE_TRANSFER',
  'ELDERLY_AND_PRESSURED',
  'SECRECY_REQUESTED',
  'URGENCY_PRESSURE',
];

export class TellerAssistDto {
  @ApiProperty({ enum: CHANNELS })
  @IsEnum(CHANNELS as unknown as object)
  transactionChannel!: TellerTransactionChannel;

  @ApiProperty({ description: 'Amount in minor units (cents).', minimum: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  amountMinor!: number;

  @ApiPropertyOptional({ default: 'USD' })
  @IsOptional()
  @IsString()
  @MaxLength(8)
  currency?: string;

  @ApiProperty({ enum: RECIPIENT_TYPES })
  @IsEnum(RECIPIENT_TYPES as unknown as object)
  recipientType!: TellerRecipientType;

  @ApiPropertyOptional({ enum: REASONS })
  @IsOptional()
  @IsEnum(REASONS as unknown as object)
  customerStatedReason?: TellerCustomerStatedReason;

  @ApiPropertyOptional({
    isArray: true,
    enum: BEHAVIORS,
    description: 'Observed teller-side behavior signals on the customer.',
  })
  @IsOptional()
  @IsEnum(BEHAVIORS as unknown as object, { each: true })
  @ArrayMaxSize(BEHAVIORS.length)
  behaviorSignals?: TellerBehaviorSignal[];

  @ApiPropertyOptional({ description: 'Whether the customer is registered in Elder Mode.' })
  @IsOptional()
  @IsBoolean()
  elderMode?: boolean;

  @ApiPropertyOptional({
    description: 'Bank-internal customer reference (e.g. masked account id). Not validated as PII.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  customerReference?: string;
}
