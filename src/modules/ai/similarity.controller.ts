import { Controller, DefaultValuePipe, Get, Param, ParseIntPipe, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { MembershipRole } from '@prisma/client';
import { Roles } from '../../common/auth/roles.decorator';
import { EmbeddingService } from './embedding.service';

/**
 * Internal similarity views (PDF §32). Given a signal, returns its top
 * near-duplicates by cosine similarity over the stored text embedding.
 * Reviewer / admin / compliance only — similarity intel is private.
 */
@ApiTags('Signal Similarity (internal)')
@ApiBearerAuth()
@Roles(MembershipRole.REVIEWER, MembershipRole.SUPER_ADMIN, MembershipRole.COMPLIANCE_OFFICER)
@Controller({ path: 'intelligence/similarity', version: '1' })
export class SimilarityController {
  constructor(private readonly embeddings: EmbeddingService) {}

  @Get(':signalId')
  @ApiOperation({ summary: 'List signals similar to this one (cosine over text embedding)' })
  @ApiQuery({ name: 'limit', required: false, description: 'Max items (1-100, default 20)' })
  list(
    @Param('signalId', ParseUUIDPipe) signalId: string,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit?: number,
  ) {
    return this.embeddings.listSimilarTo(signalId, limit);
  }
}
