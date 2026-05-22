import { ApiProperty } from '@nestjs/swagger';
import { RegistryAppealType } from '@prisma/client';
import { IsEmail, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * A public correction / appeal against a PUBLISHED registry entry (PDF §27).
 * Anyone affected by a listing may contest it — no login required. Filing an
 * appeal never alters the entry; only a reviewed decision can.
 */
export class CreateRegistryAppealDto {
  @ApiProperty({ enum: RegistryAppealType, description: 'What the submitter is asking for.' })
  @IsEnum(RegistryAppealType)
  appealType!: RegistryAppealType;

  @ApiProperty({ description: 'Name of the person filing the appeal.' })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  submitterName!: string;

  @ApiProperty({ description: 'Contact email — stored privately, never published.' })
  @IsEmail()
  @MaxLength(320)
  submitterEmail!: string;

  @ApiProperty({
    required: false,
    description: 'How the submitter relates to the indicator (e.g. "domain owner").',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  submitterRelationship?: string;

  @ApiProperty({ description: 'Why the entry is being contested.' })
  @IsString()
  @MinLength(20)
  @MaxLength(3000)
  reason!: string;

  @ApiProperty({ required: false, description: 'The specific correction being requested.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  requestedChange?: string;
}
