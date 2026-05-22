import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateRegistryCandidateDto {
  @ApiProperty({ format: 'uuid', description: 'A signal already promoted to verified intelligence.' })
  @IsUUID()
  signalId!: string;

  @ApiProperty({
    description:
      'Reviewer-authored public-safe summary. Raw report text / victim data is NEVER copied — the reviewer writes clean, status-based language.',
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
