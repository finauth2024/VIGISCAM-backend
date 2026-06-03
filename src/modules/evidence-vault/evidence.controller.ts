import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AuthenticatedUser } from '../../common/auth/auth.types';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { ShareEvidenceFileDto } from './dto/share-evidence-file.dto';
import { UploadEvidenceFileDto } from './dto/upload-evidence-file.dto';
import { EvidenceFileService } from './evidence-file.service';
import { EvidenceService } from './evidence.service';

const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 MB

@ApiTags('Evidence Vault')
@ApiBearerAuth()
@Controller({ path: 'evidence', version: '1' })
export class EvidenceController {
  constructor(
    private readonly evidence: EvidenceService,
    private readonly files: EvidenceFileService,
  ) {}

  @Get('timeline')
  @ApiOperation({ summary: 'Hash-chained evidence timeline for my tenant' })
  @ApiQuery({ name: 'entityType', required: false, description: 'e.g. SCAM_SIGNAL' })
  @ApiQuery({ name: 'entityId', required: false, description: 'Filter to one entity' })
  timeline(
    @CurrentUser() user: AuthenticatedUser,
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
  ) {
    return this.evidence.getTimeline(user.tenantId, { entityType, entityId });
  }

  @Get('verify')
  @ApiOperation({ summary: 'Verify the integrity of my tenant evidence chain' })
  verify(@CurrentUser() user: AuthenticatedUser) {
    return this.evidence.verifyChain(user.tenantId);
  }

  // ── 10A: File storage on top of the chain ─────────────────────────────────

  @Post(':eventId/files')
  @ApiOperation({ summary: 'Upload a file to an evidence event (multipart/form-data)' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @CurrentUser() user: AuthenticatedUser,
    @Param('eventId', new ParseUUIDPipe()) eventId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: UploadEvidenceFileDto,
  ) {
    if (!file) {
      throw new BadRequestException('Missing "file" form field');
    }
    if (file.size > MAX_FILE_BYTES) {
      throw new BadRequestException(`File too large (max ${MAX_FILE_BYTES} bytes)`);
    }
    let metadata: Record<string, unknown> | undefined;
    if (body.metadata) {
      try {
        const parsed = JSON.parse(body.metadata);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          metadata = parsed as Record<string, unknown>;
        } else {
          throw new Error('not an object');
        }
      } catch {
        throw new BadRequestException('metadata must be a JSON object string');
      }
    }
    const row = await this.files.upload(user, eventId, file, {
      retentionUntil: body.retentionUntil,
      legalHold: body.legalHold,
      metadata,
    });
    return {
      ...row,
      sizeBytes: row.sizeBytes.toString(),
    };
  }

  @Post(':eventId/share')
  @ApiOperation({ summary: 'Generate signed URLs for file(s) on an evidence event' })
  @HttpCode(200)
  share(
    @CurrentUser() user: AuthenticatedUser,
    @Param('eventId', new ParseUUIDPipe()) eventId: string,
    @Body() body: ShareEvidenceFileDto,
  ) {
    return this.files.generateShareLinks(user, eventId, body);
  }

  @Post(':eventId/export')
  @ApiOperation({ summary: 'Export an evidence bundle (live manifest + signed URLs)' })
  @HttpCode(200)
  export(
    @CurrentUser() user: AuthenticatedUser,
    @Param('eventId', new ParseUUIDPipe()) eventId: string,
  ) {
    return this.files.exportBundle(user, eventId);
  }

  @Post(':eventId/export-bundle')
  @ApiOperation({
    summary: 'Request a persisted, checksummed evidence export bundle (async via worker)',
  })
  @HttpCode(202)
  exportBundle(
    @CurrentUser() user: AuthenticatedUser,
    @Param('eventId', new ParseUUIDPipe()) eventId: string,
  ) {
    return this.files.requestExportBundle(user, eventId);
  }

  @Get('bundles/:bundleId')
  @ApiOperation({ summary: 'Fetch a persisted evidence export bundle (manifest + checksum)' })
  getBundle(
    @CurrentUser() user: AuthenticatedUser,
    @Param('bundleId', new ParseUUIDPipe()) bundleId: string,
  ) {
    return this.files.getBundle(user, bundleId);
  }

  @Get(':eventId/public-safe')
  @ApiOperation({
    summary: 'Redacted public-safe view of an evidence event (no URLs, no blob paths)',
  })
  publicSafe(
    @CurrentUser() user: AuthenticatedUser,
    @Param('eventId', new ParseUUIDPipe()) eventId: string,
  ) {
    return this.files.publicSafeView(user, eventId);
  }

  @Patch('files/:fileId/legal-hold')
  @ApiOperation({ summary: 'Set or lift legal hold on a single evidence file' })
  setLegalHold(
    @CurrentUser() user: AuthenticatedUser,
    @Param('fileId', new ParseUUIDPipe()) fileId: string,
    @Body() body: { legalHold: boolean },
  ) {
    if (typeof body?.legalHold !== 'boolean') {
      throw new BadRequestException('legalHold must be a boolean');
    }
    return this.files.setLegalHold(user, fileId, body.legalHold);
  }
}
