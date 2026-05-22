import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

/**
 * A telemetry report from the desktop agent / browser extension describing the
 * technical environment of a session (PDF §20 — FREEZEGUARD inputs).
 */
export class TelemetryDto {
  @ApiProperty({ required: false, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  sessionId?: string;

  @ApiProperty({ required: false, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  deviceId?: string;

  @ApiProperty({ required: false, type: [String], example: ['AnyDesk', 'TeamViewer'] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  remoteAccessTools?: string[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  screenSharing?: boolean;

  @ApiProperty({ required: false, description: 'Remote keyboard/mouse input observed.' })
  @IsOptional()
  @IsBoolean()
  remoteInputDetected?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  clipboardHijackDetected?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  suspiciousBrowserActivity?: boolean;

  @ApiProperty({ required: false, description: 'A banking site is currently open.' })
  @IsOptional()
  @IsBoolean()
  bankingSiteOpen?: boolean;
}
