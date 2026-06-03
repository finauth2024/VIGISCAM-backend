import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { AuthenticityCheckType } from '@prisma/client';
import { IsEnum, IsObject, IsOptional, IsString, IsUUID } from 'class-validator';

/**
 * CP-4 — media is now first-class + validated. The image checks
 * (LIVE_FACE_SEAL / SCENE_SEAL / ANTI_FAKE_VIDEO) take `imageBase64`/`imageUrl`
 * (or a sampled `frameBase64`/`frameUrl`); VOICE_MATCH_SEAL takes
 * `audioBase64`/`audioUrl`. CAM_VIGUARD / DUAL_AUTH are deterministic and use
 * the free-form `payload` (fingerprints / challenge). When an ML check is run
 * without media, the backend returns INCONCLUSIVE and stores the reason.
 */
export class RequestAuthenticityCheckDto {
  @ApiProperty({ format: 'uuid', description: 'The monitored session this check applies to.' })
  @IsUUID()
  sessionId!: string;

  @ApiProperty({ enum: AuthenticityCheckType, description: 'Which authenticity engine to run.' })
  @IsEnum(AuthenticityCheckType)
  checkType!: AuthenticityCheckType;

  @ApiPropertyOptional({ description: 'Base64-encoded image bytes (image checks).' })
  @IsOptional()
  @IsString()
  imageBase64?: string;

  @ApiPropertyOptional({ description: 'URL the AI worker fetches the image from.' })
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @ApiPropertyOptional({ description: 'Base64-encoded sampled video frame.' })
  @IsOptional()
  @IsString()
  frameBase64?: string;

  @ApiPropertyOptional({ description: 'URL of a sampled video frame.' })
  @IsOptional()
  @IsString()
  frameUrl?: string;

  @ApiPropertyOptional({ description: 'Base64-encoded audio bytes (VOICE_MATCH_SEAL).' })
  @IsOptional()
  @IsString()
  audioBase64?: string;

  @ApiPropertyOptional({ description: 'URL the AI worker fetches the audio from.' })
  @IsOptional()
  @IsString()
  audioUrl?: string;

  @ApiPropertyOptional({ description: 'Evidence Vault reference to attach the verdict to.' })
  @IsOptional()
  @IsString()
  evidenceRef?: string;

  @ApiPropertyOptional({
    type: Object,
    description:
      'Extra check-specific keys passed through to the AI worker. DUAL_AUTH ' +
      'takes `expectedChallenge`+`providedChallenge`; CAM_VIGUARD takes ' +
      '`enrolledFingerprint`+`observedFingerprint`.',
  })
  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;
}
