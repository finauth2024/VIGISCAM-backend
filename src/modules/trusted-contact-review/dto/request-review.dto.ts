import { ApiProperty } from '@nestjs/swagger';
import { TrustedContactReviewTriggerModule } from '@prisma/client';
import {
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * The user (or one of the protection modules acting on the user's
 * behalf) asks a trusted contact to weigh in on a high-risk event.
 *
 * Most callers will be other Phase 9 services calling
 * `TrustedContactReviewService.requestReview()` directly with a typed
 * input — the HTTP DTO exists for the dashboard surface where a user
 * manually escalates from a history view.
 */
export class RequestReviewDto {
  @ApiProperty({ format: 'uuid', description: 'Which trusted contact to ask.' })
  @IsUUID()
  contactId!: string;

  @ApiProperty({ enum: TrustedContactReviewTriggerModule })
  @IsEnum(TrustedContactReviewTriggerModule)
  triggerModule!: TrustedContactReviewTriggerModule;

  @ApiProperty({
    format: 'uuid',
    description: 'Row id in the triggering module (scamhold_events.id, etc.).',
  })
  @IsUUID()
  triggerEventId!: string;

  @ApiProperty({
    description:
      'Public-safe summary the trusted contact sees. Status-based language only (PDF §38 #7/#8).',
  })
  @IsString()
  @MinLength(10)
  @MaxLength(400)
  triggerSummary!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
