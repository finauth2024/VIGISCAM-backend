import { ApiProperty } from '@nestjs/swagger';
import { WebhookEventType } from '@prisma/client';
import {
  ArrayMinSize,
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  IsUrl,
  MaxLength,
} from 'class-validator';

export class CreateWebhookSubscriptionDto {
  @ApiProperty({ format: 'uuid', description: 'The partner tenant that owns the subscription.' })
  @IsUUID()
  tenantId!: string;

  @ApiProperty({ description: 'HTTPS endpoint VIGISCAM will POST events to.' })
  @IsUrl({ require_protocol: true, require_tld: true, protocols: ['https'] })
  @MaxLength(2048)
  url!: string;

  @ApiProperty({
    enum: WebhookEventType,
    isArray: true,
    description: 'Event types the subscription will receive.',
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMinSize(1)
  @IsEnum(WebhookEventType, { each: true })
  eventTypes!: WebhookEventType[];

  @ApiProperty({ required: false, description: 'Optional human label for the subscription.' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  label?: string;
}
