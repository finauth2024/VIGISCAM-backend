import { ApiProperty } from '@nestjs/swagger';
import { TakedownProviderType } from '@prisma/client';
import { IsEnum, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

/**
 * Opens a takedown request against a verified registry entry (PDF §27). The
 * request is created as a DRAFT — it is not considered sent until submitted.
 */
export class CreateTakedownDto {
  @ApiProperty({ format: 'uuid', description: 'The registry entry whose infrastructure is targeted.' })
  @IsUUID()
  registryEntryId!: string;

  @ApiProperty({ enum: TakedownProviderType, description: 'Kind of provider the request is addressed to.' })
  @IsEnum(TakedownProviderType)
  providerType!: TakedownProviderType;

  @ApiProperty({ description: 'Provider the request is addressed to (e.g. registrar / host name).' })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  providerName!: string;

  @ApiProperty({ required: false, description: "Provider's own case / ticket reference, if known." })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  providerReference?: string;

  @ApiProperty({ description: 'What is being requested and why — operational detail.' })
  @IsString()
  @MinLength(10)
  @MaxLength(3000)
  details!: string;
}
