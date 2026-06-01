import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';

export enum BankQueueRiskFilter {
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

export class BankQueueQueryDto {
  @ApiPropertyOptional({
    enum: BankQueueRiskFilter,
    description: 'Minimum risk level to include (default MEDIUM).',
  })
  @IsOptional()
  @IsEnum(BankQueueRiskFilter)
  minRiskLevel?: BankQueueRiskFilter;

  @ApiPropertyOptional({ minimum: 1, maximum: 200, default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}
