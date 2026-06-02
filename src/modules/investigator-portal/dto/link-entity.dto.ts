import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

/** Used for both /evidence and /clusters link endpoints. */
export class LinkEntityDto {
  @ApiProperty({ description: 'ID of the evidence event or ScamCluster to link.' })
  @IsUUID()
  entityId!: string;

  @ApiPropertyOptional({
    description: 'Why this is being linked — audit-visible. Highly recommended.',
    maxLength: 2_000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  rationale?: string;
}
