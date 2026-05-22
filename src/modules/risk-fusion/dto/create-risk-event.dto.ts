import { ApiProperty } from '@nestjs/swagger';
import { RiskModuleSource } from '@prisma/client';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateRiskEventDto {
  @ApiProperty({ example: 'REMOTE_ACCESS_DETECTED' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  eventType!: string;

  @ApiProperty({ example: 'Remote-access tool launched during a banking session' })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  triggerReason!: string;

  @ApiProperty({ type: [String], example: ['REMOTE_ACCESS', 'URGENCY'] })
  @IsArray()
  @ArrayMaxSize(40)
  @IsString({ each: true })
  signals!: string[];

  @ApiProperty({ required: false, enum: RiskModuleSource })
  @IsOptional()
  @IsEnum(RiskModuleSource)
  moduleSource?: RiskModuleSource;

  @ApiProperty({ required: false, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  sessionId?: string;
}
