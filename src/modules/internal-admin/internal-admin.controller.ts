import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { MembershipRole } from '@prisma/client';
import { Request } from 'express';
import { AuthenticatedUser } from '../../common/auth/auth.types';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { ChangeInternalRoleDto } from './dto/change-internal-role.dto';
import { GrantInternalRoleDto } from './dto/grant-internal-role.dto';
import { InternalAdminService } from './internal-admin.service';

/**
 * Internal staff role management (PDF §7, §37). SUPER_ADMIN only — the single
 * most privileged surface in VIGISCAM.
 */
@ApiTags('Internal Admin')
@ApiBearerAuth()
@Roles(MembershipRole.SUPER_ADMIN)
@Controller({ path: 'admin/staff', version: '1' })
export class InternalAdminController {
  constructor(private readonly admin: InternalAdminService) {}

  @Get()
  @ApiOperation({ summary: 'List internal VIGISCAM staff and their roles' })
  list() {
    return this.admin.listStaff();
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Grant an internal role to an existing account' })
  grant(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: GrantInternalRoleDto,
    @Req() req: Request,
  ) {
    return this.admin.grantRole(user, dto, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Patch(':id/role')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Change an internal staff member’s role' })
  changeRole(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeInternalRoleDto,
    @Req() req: Request,
  ) {
    return this.admin.changeRole(user, id, dto, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke an internal staff role' })
  revoke(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    return this.admin.revokeRole(user, id, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }
}
