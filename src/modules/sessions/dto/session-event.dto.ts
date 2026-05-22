import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class SessionEventDto {
  @ApiProperty({ example: 'SCREEN_SHARE_STARTED' })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  type!: string;

  @ApiProperty({ required: false, example: 'Remote-access tool detected: AnyDesk' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  detail?: string;
}
