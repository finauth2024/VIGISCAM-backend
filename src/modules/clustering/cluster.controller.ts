import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { MembershipRole } from '@prisma/client';
import { Roles } from '../../common/auth/roles.decorator';
import { ClusterService } from './cluster.service';

/**
 * Internal scam-cluster views (PDF §32, §36). Reviewers, admins and compliance
 * only — clusters are private intelligence, never a public surface.
 */
@ApiTags('Scam Clusters (internal)')
@ApiBearerAuth()
@Roles(MembershipRole.REVIEWER, MembershipRole.SUPER_ADMIN, MembershipRole.COMPLIANCE_OFFICER)
@Controller({ path: 'intelligence/clusters', version: '1' })
export class ClusterController {
  constructor(private readonly clusters: ClusterService) {}

  @Get()
  @ApiOperation({ summary: 'List scam clusters (optionally filter by ?status= and ?matchType=)' })
  @ApiQuery({ name: 'status', required: false, description: 'ClusterStatus filter' })
  @ApiQuery({ name: 'matchType', required: false, description: 'ClusterMatchType filter' })
  list(@Query('status') status?: string, @Query('matchType') matchType?: string) {
    return this.clusters.listClusters(status, matchType);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single cluster with its member signals' })
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.clusters.getCluster(id);
  }
}
