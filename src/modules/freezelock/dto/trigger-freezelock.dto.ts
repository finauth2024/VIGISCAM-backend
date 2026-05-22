import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class TriggerFreezeLockDto {
  @ApiProperty({ example: 'User reported an active scam call' })
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  trigger!: string;

  @ApiProperty({ required: false, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  sessionId?: string;

  @ApiProperty({ required: false, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  riskEventId?: string;

  @ApiProperty({
    required: false,
    type: [String],
    description: 'Override the default intervention actions.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  actions?: string[];
}
