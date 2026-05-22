import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { MembershipRole } from '@prisma/client';
import { Request } from 'express';
import { AuthenticatedUser } from '../../common/auth/auth.types';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { CreateRegistryCandidateDto } from './dto/create-registry-candidate.dto';
import { RegistryService } from './registry.service';

/**
 * Internal registry governance (PDF §26, §27). Drives the lifecycle that turns
 * verified intelligence into a published, public-safe registry entry:
 *   CANDIDATE -> APPROVED_PUBLIC_SAFE -> PUBLISHED
 * Reviewers create candidates; publication and takedown are admin-only.
 */
@ApiTags('Registry Governance (internal)')
@ApiBearerAuth()
@Roles(MembershipRole.REVIEWER, MembershipRole.SUPER_ADMIN, MembershipRole.COMPLIANCE_OFFICER)
@Controller({ path: 'intelligence/registry', version: '1' })
export class RegistryAdminController {
  constructor(private readonly registry: RegistryService) {}

  @Post('candidates')
  @HttpCode(HttpStatus.CREATED)
  @Roles(MembershipRole.REVIEWER, MembershipRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Promote a verified signal into a registry candidate' })
  createCandidate(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateRegistryCandidateDto,
    @Req() req: Request,
  ) {
    return this.registry.createCandidate(user, dto, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Get()
  @ApiOperation({ summary: 'List registry entries (optionally filter by ?status=)' })
  @ApiQuery({ name: 'status', required: false, description: 'RegistryEntryStatus filter' })
  list(@Query('status') status?: string) {
    return this.registry.listInternal(status);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single registry entry (internal view)' })
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.registry.getInternal(id);
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @Roles(MembershipRole.SUPER_ADMIN, MembershipRole.COMPLIANCE_OFFICER)
  @ApiOperation({ summary: 'Approve a candidate as public-safe' })
  approve(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    return this.registry.approve(user, id, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Post(':id/publish')
  @HttpCode(HttpStatus.OK)
  @Roles(MembershipRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Publish an approved entry to the public registry' })
  publish(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    return this.registry.publish(user, id, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Post(':id/unpublish')
  @HttpCode(HttpStatus.OK)
  @Roles(MembershipRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Remove a published entry from the public registry' })
  unpublish(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    return this.registry.unpublish(user, id, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @Roles(MembershipRole.SUPER_ADMIN, MembershipRole.COMPLIANCE_OFFICER)
  @ApiOperation({ summary: 'Reject a registry entry' })
  reject(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    return this.registry.reject(user, id, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }
}
