import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class ShareEvidenceFileDto {
  @ApiProperty({
    required: false,
    description: 'Specific file id to share. When omitted, every file on the event is shared.',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID()
  fileId?: string;

  @ApiProperty({
    required: false,
    default: 900,
    description: 'Signed URL TTL in seconds (60 – 86400, default 900 = 15 min).',
  })
  @IsOptional()
  @IsInt()
  @Min(60)
  @Max(86_400)
  expiresInSeconds?: number;
}
