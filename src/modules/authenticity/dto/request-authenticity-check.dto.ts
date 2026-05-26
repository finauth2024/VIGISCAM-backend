import { ApiProperty } from '@nestjs/swagger';
import { AuthenticityCheckType } from '@prisma/client';
import { IsEnum, IsObject, IsOptional, IsUUID } from 'class-validator';

export class RequestAuthenticityCheckDto {
  @ApiProperty({ format: 'uuid', description: 'The monitored session this check applies to.' })
  @IsUUID()
  sessionId!: string;

  @ApiProperty({ enum: AuthenticityCheckType, description: 'Which authenticity engine to run.' })
  @IsEnum(AuthenticityCheckType)
  checkType!: AuthenticityCheckType;

  @ApiProperty({
    required: false,
    type: Object,
    description: 'Check-specific payload (e.g. frame hash, audio reference, device fingerprint).',
  })
  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;
}
