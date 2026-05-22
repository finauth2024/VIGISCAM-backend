import { ApiProperty } from '@nestjs/swagger';
import { SessionType } from '@prisma/client';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';

export class StartSessionDto {
  @ApiProperty({ enum: SessionType })
  @IsEnum(SessionType)
  type!: SessionType;

  @ApiProperty({ required: false, format: 'uuid', description: 'Device this session runs on.' })
  @IsOptional()
  @IsUUID()
  deviceId?: string;
}
