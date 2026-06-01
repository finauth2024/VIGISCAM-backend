import { ApiProperty } from '@nestjs/swagger';
import { ScamMirrorPersona } from '@prisma/client';
import { IsEnum, IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class StartSessionDto {
  @ApiProperty({ enum: ScamMirrorPersona })
  @IsEnum(ScamMirrorPersona)
  persona!: ScamMirrorPersona;

  @ApiProperty({ description: 'One-paragraph scenario the user is practising.' })
  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  scenario!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
