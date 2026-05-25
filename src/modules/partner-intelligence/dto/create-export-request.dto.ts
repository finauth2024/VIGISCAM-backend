import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Filters that narrow which evidence events are frozen into the bundle.
 * Empty body = "everything this tenant has up to the size cap".
 */
export class CreateExportRequestDto {
  @ApiProperty({ required: false, description: 'e.g. "SCAM_SIGNAL", "WEBHOOK_SUBSCRIPTION".' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  entityType?: string;

  @ApiProperty({ required: false, description: 'Narrow to one entity.' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  entityId?: string;

  @ApiProperty({ required: false, description: 'ISO timestamp — include only events at or after this point.' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiProperty({ required: false, description: 'ISO timestamp — include only events at or before this point.' })
  @IsOptional()
  @IsDateString()
  to?: string;
}
