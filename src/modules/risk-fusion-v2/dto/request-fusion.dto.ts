import { ApiProperty } from '@nestjs/swagger';
import { FraudJourneyStage, VictimStateLabel } from '@prisma/client';
import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class RequestFusionDto {
  @ApiProperty({ format: 'uuid', description: 'The monitored session to fuse.' })
  @IsUUID()
  sessionId!: string;

  @ApiProperty({ required: false, description: 'Optional transcript / interaction text fed to the AI stubs.' })
  @IsOptional()
  @IsString()
  @MaxLength(10_000)
  transcript?: string;

  @ApiProperty({ required: false, description: 'Optional reviewer notes fed to the AI stubs.' })
  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  notes?: string;

  @ApiProperty({ required: false, enum: FraudJourneyStage, description: 'Optional explicit stage override.' })
  @IsOptional()
  @IsEnum(FraudJourneyStage)
  forceStage?: FraudJourneyStage;

  @ApiProperty({ required: false, enum: VictimStateLabel, description: 'Optional explicit victim-state override.' })
  @IsOptional()
  @IsEnum(VictimStateLabel)
  forceState?: VictimStateLabel;
}
