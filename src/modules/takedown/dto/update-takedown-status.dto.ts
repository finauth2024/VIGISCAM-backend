import { ApiProperty } from '@nestjs/swagger';
import { TakedownStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Advances a takedown request to a new status. The service validates that the
 * transition is legal — e.g. a COMPLETED request cannot be reopened.
 */
export class UpdateTakedownStatusDto {
  @ApiProperty({ enum: TakedownStatus, description: 'The status to move the request to.' })
  @IsEnum(TakedownStatus)
  status!: TakedownStatus;

  @ApiProperty({ required: false, description: "Provider's case / ticket reference, if newly known." })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  providerReference?: string;

  @ApiProperty({ required: false, description: 'Notes on the update or the final outcome.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
