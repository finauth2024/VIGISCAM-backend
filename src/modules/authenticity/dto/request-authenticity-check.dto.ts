import { ApiProperty } from '@nestjs/swagger';
import { AuthenticityCheckType } from '@prisma/client';
import { IsEnum, IsObject, IsOptional, IsUUID } from 'class-validator';

export class RequestAuthenticityCheckDto {
  @ApiProperty({ format: 'uuid', description: 'The monitored session this check applies to.' })
  @IsUUID()
  sessionId!: string;

  @ApiProperty({ enum: AuthenticityCheckType, description: 'Which authenticity engine to run.' })
  @IsEnum(AuthenticityCheckType)
  checkType!: AuthenticityCheckType;

  @ApiProperty({
    required: false,
    type: Object,
    description:
      'Check-specific payload. For ML checks, include the media so the AI ' +
      'worker can run inference: image checks (LIVE_FACE_SEAL, SCENE_SEAL, ' +
      'ANTI_FAKE_VIDEO) take `imageBase64`/`imageUrl` (or `frameBase64`/' +
      '`frameUrl`); voice (VOICE_MATCH_SEAL) takes `audioBase64`/`audioUrl`; ' +
      'DUAL_AUTH takes `expectedChallenge`+`providedChallenge`; CAM_VIGUARD ' +
      'takes `enrolledFingerprint`+`observedFingerprint`. Without media, ML ' +
      'checks return INCONCLUSIVE. Nested keys pass through to the worker.',
  })
  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;
}
