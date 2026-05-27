import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { MembershipRole } from '@prisma/client';
import { Roles } from '../../common/auth/roles.decorator';
import { AddCampaignMemberDto } from './dto/add-campaign-member.dto';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { FraudGraphService } from './fraud-graph.service';

/**
 * Internal views into the Identity Collision Graph (PDF §32). Reviewer /
 * admin / compliance only. The graph itself is private intelligence — only
 * the public registry exposes verified, public-safe outputs derived from it.
 */
@ApiTags('Fraud Graph (internal)')
@ApiBearerAuth()
@Roles(MembershipRole.REVIEWER, MembershipRole.SUPER_ADMIN, MembershipRole.COMPLIANCE_OFFICER)
@Controller({ path: 'intelligence/graph', version: '1' })
export class FraudGraphController {
  constructor(private readonly graph: FraudGraphService) {}

  @Get('nodes')
  @ApiOperation({ summary: 'List graph nodes (highest risk + most-seen first)' })
  @ApiQuery({ name: 'indicatorType', required: false })
  @ApiQuery({ name: 'category', required: false })
  @ApiQuery({ name: 'limit', required: false, description: 'Max items (1-500, default 100)' })
  listNodes(
    @Query('indicatorType') indicatorType?: string,
    @Query('category') category?: string,
    @Query('limit', new DefaultValuePipe(100), ParseIntPipe) limit?: number,
  ) {
    return this.graph.listNodes({ indicatorType, category, limit });
  }

  @Get('nodes/:id')
  @ApiOperation({ summary: 'Get one graph node' })
  getNode(@Param('id', ParseUUIDPipe) id: string) {
    return this.graph.getNode(id);
  }

  @Get('nodes/:id/neighbors')
  @ApiOperation({ summary: 'Get the neighbors of one node with their connecting edges' })
  @ApiQuery({ name: 'limit', required: false, description: 'Max items (1-200, default 50)' })
  getNeighbors(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit?: number,
  ) {
    return this.graph.getNeighbors(id, limit);
  }

  // ─────── Phase 7B — campaign-level graph ───────

  @Get('campaigns')
  @ApiOperation({ summary: 'List scam campaigns (CAMPAIGN nodes)' })
  @ApiQuery({ name: 'limit', required: false })
  listCampaigns(@Query('limit', new DefaultValuePipe(100), ParseIntPipe) limit?: number) {
    return this.graph.listCampaigns(limit);
  }

  @Post('campaigns')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new scam campaign' })
  createCampaign(@Body() dto: CreateCampaignDto) {
    return this.graph.createCampaign(dto);
  }

  @Get('campaigns/:id')
  @ApiOperation({ summary: 'Get one campaign with its indicator-node members' })
  getCampaign(@Param('id', ParseUUIDPipe) id: string) {
    return this.graph.getCampaignWithMembers(id);
  }

  @Post('campaigns/:id/members')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Attach an INDICATOR node as a member of this campaign' })
  addMember(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AddCampaignMemberDto) {
    return this.graph.addCampaignMember(id, dto.nodeId);
  }

  @Delete('campaigns/:id/members/:nodeId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a member from this campaign (idempotent)' })
  async removeMember(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('nodeId', ParseUUIDPipe) nodeId: string,
  ): Promise<void> {
    await this.graph.removeCampaignMember(id, nodeId);
  }
}
