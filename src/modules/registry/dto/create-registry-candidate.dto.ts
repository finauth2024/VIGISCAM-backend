import { ApiProperty } from '@nestjs/swagger';
import { RegistryPublicStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateRegistryCandidateDto {
  @ApiProperty({ format: 'uuid', description: 'A signal already promoted to verified intelligence.' })
  @IsUUID()
  signalId!: string;

  @ApiProperty({
    enum: RegistryPublicStatus,
    description:
      'The public-safe classification the reviewer assigns. This is the only ' +
      'status-based label shown publicly — internal lifecycle statuses are never exposed.',
  })
  @IsEnum(RegistryPublicStatus)
  publicStatus!: RegistryPublicStatus;

  @ApiProperty({
    description:
      'Reviewer-authored public-safe summary. Raw report text / victim data is NEVER copied — the reviewer writes clean, status-based language. Direct identity accusations are rejected.',
  })
  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  publicSafeSummary!: string;

  @ApiProperty({ required: false, description: 'Public-safe recommended action.' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  recommendedAction?: string;

  @ApiProperty({ required: false, description: 'Scam category code.' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  category?: string;
}
