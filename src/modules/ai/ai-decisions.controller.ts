import { Controller, DefaultValuePipe, Get, ParseIntPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { MembershipRole, Prisma } from '@prisma/client';
import { Roles } from '../../common/auth/roles.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * Internal observability for the AI decision audit trail (PDF non-negotiable
 * #13). Reviewer / admin / compliance only — AI verdict audit is sensitive
 * intelligence and never a public surface.
 */
@ApiTags('AI Decisions (internal)')
@ApiBearerAuth()
@Roles(MembershipRole.REVIEWER, MembershipRole.SUPER_ADMIN, MembershipRole.COMPLIANCE_OFFICER)
@Controller({ path: 'intelligence/ai-decisions', version: '1' })
export class AiDecisionsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'List recorded AI decisions (most recent first)' })
  @ApiQuery({ name: 'serviceKind', required: false, description: 'e.g. NLP_CLASSIFIER' })
  @ApiQuery({ name: 'entityType', required: false })
  @ApiQuery({ name: 'entityId', required: false })
  @ApiQuery({ name: 'limit', required: false, description: 'Max items (1-500, default 100)' })
  list(
    @Query('serviceKind') serviceKind?: string,
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
    @Query('limit', new DefaultValuePipe(100), ParseIntPipe) limit?: number,
  ) {
    const where: Prisma.AIDecisionWhereInput = {};
    if (serviceKind) where.serviceKind = serviceKind;
    if (entityType) where.entityType = entityType;
    if (entityId) where.entityId = entityId;
    return this.prisma.aIDecision.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit ?? 100, 1), 500),
    });
  }
}
