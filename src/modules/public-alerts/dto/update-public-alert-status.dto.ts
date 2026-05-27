import { ApiProperty } from '@nestjs/swagger';
import { PublicAlertStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdatePublicAlertStatusDto {
  @ApiProperty({ enum: PublicAlertStatus, description: 'Target status.' })
  @IsEnum(PublicAlertStatus)
  status!: PublicAlertStatus;

  @ApiProperty({ required: false, description: 'Reviewer note recorded in evidence.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;
}
