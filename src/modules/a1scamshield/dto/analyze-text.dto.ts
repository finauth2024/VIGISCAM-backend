import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class AnalyzeTextDto {
  @ApiProperty({ example: 'Install AnyDesk and move your money to a safe account now.' })
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  text!: string;

  @ApiProperty({ required: false, format: 'uuid', description: 'Session this text belongs to.' })
  @IsOptional()
  @IsUUID()
  sessionId?: string;
}
