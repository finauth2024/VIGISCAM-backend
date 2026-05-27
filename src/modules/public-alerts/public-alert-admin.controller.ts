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
import { CreatePublicAlertDto } from './dto/create-public-alert.dto';
import { UpdatePublicAlertStatusDto } from './dto/update-public-alert-status.dto';
import { PublicAlertService } from './public-alert.service';

/**
 * Internal authoring + publication control surface for public alerts. Alerts
 * are public statements — restricted to SUPER_ADMIN and COMPLIANCE_OFFICER
 * (same authority that publishes registry entries).
 */
@ApiTags('Public Alerts (internal)')
@ApiBearerAuth()
@Roles(MembershipRole.SUPER_ADMIN, MembershipRole.COMPLIANCE_OFFICER)
@Controller({ path: 'admin/public-alerts', version: '1' })
export class PublicAlertAdminController {
  constructor(private readonly alerts: PublicAlertService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Draft a new public alert' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePublicAlertDto,
    @Req() req: Request,
  ) {
    return this.alerts.create(user, dto, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Get()
  @ApiOperation({ summary: 'List public alerts (admin view)' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'region', required: false })
  list(@Query('status') status?: string, @Query('region') region?: string) {
    return this.alerts.listInternal({ status, region });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one public alert (admin view)' })
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.alerts.getInternal(id);
  }

  @Post(':id/status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Transition a public alert to a new status' })
  updateStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePublicAlertStatusDto,
    @Req() req: Request,
  ) {
    return this.alerts.updateStatus(user, id, dto, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }
}
