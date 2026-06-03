import { ApiPropertyOptional } from '@nestjs/swagger';
import { ProtectionLevel } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class UpdateUserProfileDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) ageGroup?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(16) preferredLanguage?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) country?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(64) timezone?: string;

  @ApiPropertyOptional({ enum: ProtectionLevel })
  @IsOptional()
  @IsEnum(ProtectionLevel)
  protectionLevel?: ProtectionLevel;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  defaultTrustedContactId?: string;

  @ApiPropertyOptional() @IsOptional() @IsBoolean() voiceWarningEnabled?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() largeTextWarningEnabled?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() accessibilityModeEnabled?: boolean;
}
