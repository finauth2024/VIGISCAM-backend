import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { CaseSeverity } from './create-case.dto';

export enum CaseStatus {
  OPEN = 'OPEN',
  IN_PROGRESS = 'IN_PROGRESS',
  AWAITING_INFORMATION = 'AWAITING_INFORMATION',
  ON_HOLD = 'ON_HOLD',
  CLOSED = 'CLOSED',
}

export class UpdateCaseDto {
  @ApiPropertyOptional({ minLength: 3, maxLength: 200 })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ maxLength: 4_000 })
  @IsOptional()
  @IsString()
  @MaxLength(4_000)
  summary?: string;

  @ApiPropertyOptional({ enum: CaseSeverity })
  @IsOptional()
  @IsEnum(CaseSeverity)
  severity?: CaseSeverity;

  @ApiPropertyOptional({
    enum: CaseStatus,
    description: 'Use POST /:id/close to set CLOSED — keeps audit cleaner.',
  })
  @IsOptional()
  @IsEnum(CaseStatus)
  status?: Exclude<CaseStatus, CaseStatus.CLOSED>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  assignedToUserId?: string;
}
