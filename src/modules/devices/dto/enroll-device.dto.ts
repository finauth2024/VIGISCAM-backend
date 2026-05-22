import { ApiProperty } from '@nestjs/swagger';
import { DeviceType } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class EnrollDeviceDto {
  @ApiProperty({ example: "Jane's Laptop" })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @ApiProperty({ enum: DeviceType })
  @IsEnum(DeviceType)
  type!: DeviceType;

  @ApiProperty({ required: false, example: 'Windows 11' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  platform?: string;
}
