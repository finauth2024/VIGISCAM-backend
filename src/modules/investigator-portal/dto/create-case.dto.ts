import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export enum CaseSeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

export class CreateCaseDto {
  @ApiProperty({ minLength: 3, maxLength: 200 })
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional({ maxLength: 4_000 })
  @IsOptional()
  @IsString()
  @MaxLength(4_000)
  summary?: string;

  @ApiPropertyOptional({ enum: CaseSeverity, default: CaseSeverity.MEDIUM })
  @IsOptional()
  @IsEnum(CaseSeverity)
  severity?: CaseSeverity;

  @ApiPropertyOptional({ description: 'User ID to assign the case to (within this tenant).' })
  @IsOptional()
  @IsUUID()
  assignedToUserId?: string;
}
