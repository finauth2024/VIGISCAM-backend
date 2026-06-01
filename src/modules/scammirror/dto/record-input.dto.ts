import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsString, MaxLength, MinLength } from 'class-validator';

export enum TurnRole {
  USER = 'USER',
  SCAMMER = 'SCAMMER',
}

export class RecordInputDto {
  @ApiProperty({
    enum: TurnRole,
    description: 'Who is "speaking" in this turn (the user role-playing both sides).',
  })
  @IsEnum(TurnRole)
  role!: TurnRole;

  @ApiProperty({
    description: 'The text of this turn. Sanitized against real secrets before storage.',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(5_000)
  text!: string;
}
