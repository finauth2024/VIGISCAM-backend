import { Body, Controller, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { MembershipRole } from '@prisma/client';
import { AuthenticatedUser } from '../../common/auth/auth.types';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { ExportClusterDto } from './dto/export-cluster.dto';
import { SearchGraphDto } from './dto/search-graph.dto';
import { IdentityGraphService } from './identity-graph.service';

/**
 * Identity Collision Graph™ (Phase 9G) — PII-safe read + export surface
 * over the underlying fraud-graph. Reviewer / compliance / admin only.
 *
 * Mounted at `/api/v1/identity-graph/*` alongside the existing
 * `/api/v1/intelligence/graph/*` controller, which keeps the raw-value
 * internal views.
 */
@ApiTags('Identity Collision Graph (internal)')
@ApiBearerAuth()
@Roles(MembershipRole.REVIEWER, MembershipRole.SUPER_ADMIN, MembershipRole.COMPLIANCE_OFFICER)
@Controller({ path: 'identity-graph', version: '1' })
export class IdentityGraphController {
  constructor(private readonly service: IdentityGraphService) {}

  @Post('search')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Case-insensitive search over the Identity Collision Graph. Sensitive node values are masked.',
  })
  search(@Body() dto: SearchGraphDto) {
    return this.service.search(dto);
  }

  @Post('clusters/:id/export')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Snapshot a CAMPAIGN cluster (members + edges, masked) and append an IDENTITY_COLLISION_REPORT to Evidence Vault.',
  })
  exportCluster(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ExportClusterDto,
  ) {
    return this.service.exportCluster(user, id, dto);
  }
}
