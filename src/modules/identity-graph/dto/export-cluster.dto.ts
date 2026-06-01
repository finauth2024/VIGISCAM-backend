import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ExportClusterDto {
  @ApiProperty({
    required: false,
    description:
      'Internal note recorded with the evidence event (reviewer rationale, case id, etc.).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
