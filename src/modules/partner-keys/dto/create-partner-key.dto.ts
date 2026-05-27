import { ApiProperty } from '@nestjs/swagger';
import { PartnerApiKeyPlan, PartnerApiKeyScope } from '@prisma/client';
import {
  ArrayMinSize,
  ArrayNotEmpty,
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreatePartnerKeyDto {
  @ApiProperty({ format: 'uuid', description: 'The partner tenant the key authenticates.' })
  @IsUUID()
  tenantId!: string;

  @ApiProperty({ description: 'Human label for the key (e.g. "ACME Bank — production ingestion").' })
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  label!: string;

  @ApiProperty({
    enum: PartnerApiKeyScope,
    isArray: true,
    description: 'Capabilities the key carries. At least one scope is required.',
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMinSize(1)
  @IsEnum(PartnerApiKeyScope, { each: true })
  scopes!: PartnerApiKeyScope[];

  @ApiProperty({
    enum: PartnerApiKeyPlan,
    required: false,
    description: 'Commercial plan tier (Phase 7E). Defaults to FREE.',
  })
  @IsOptional()
  @IsEnum(PartnerApiKeyPlan)
  plan?: PartnerApiKeyPlan;

  @ApiProperty({
    required: false,
    description: 'Optional expiry. If omitted, the key is long-lived and must be revoked manually.',
  })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}
