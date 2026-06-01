import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';

export enum PlatformQueueRiskFilter {
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

export class ModerationQueueQueryDto {
  @ApiPropertyOptional({
    enum: PlatformQueueRiskFilter,
    description: 'Minimum risk level to include (default MEDIUM).',
  })
  @IsOptional()
  @IsEnum(PlatformQueueRiskFilter)
  minRiskLevel?: PlatformQueueRiskFilter;

  @ApiPropertyOptional({ minimum: 1, maximum: 200, default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}
