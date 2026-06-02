import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export enum IntegrationKind {
  SLACK = 'SLACK',
  EMAIL_DISTRIBUTION = 'EMAIL_DISTRIBUTION',
  SIEM_WEBHOOK = 'SIEM_WEBHOOK',
  TICKETING = 'TICKETING',
  WEBHOOK = 'WEBHOOK',
  SSO = 'SSO',
}

export enum IntegrationStatus {
  ACTIVE = 'ACTIVE',
  PAUSED = 'PAUSED',
  ERROR = 'ERROR',
}

export class CreateIntegrationDto {
  @ApiProperty({ enum: IntegrationKind })
  @IsEnum(IntegrationKind)
  kind!: IntegrationKind;

  @ApiProperty({ minLength: 2, maxLength: 100 })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name!: string;

  @ApiProperty({
    description: 'Integration-specific config (webhook URLs, token references, etc.).',
    type: 'object',
    additionalProperties: true,
  })
  @IsObject()
  config!: Record<string, unknown>;

  @ApiPropertyOptional({ enum: IntegrationStatus, default: IntegrationStatus.ACTIVE })
  @IsOptional()
  @IsEnum(IntegrationStatus)
  status?: IntegrationStatus;
}
