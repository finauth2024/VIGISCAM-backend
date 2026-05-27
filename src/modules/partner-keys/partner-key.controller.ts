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
  Patch,
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
import { CreatePartnerKeyDto } from './dto/create-partner-key.dto';
import { UpdatePartnerKeyPlanDto } from './dto/update-partner-key-plan.dto';
import { PartnerKeyService } from './partner-key.service';

/**
 * Internal management of partner API keys (PDF §39). SUPER_ADMIN only.
 * The raw key is shown exactly ONCE in the issuance response — callers MUST
 * capture it then; it cannot be retrieved afterwards.
 */
@ApiTags('Partner API Keys (internal)')
@ApiBearerAuth()
@Roles(MembershipRole.SUPER_ADMIN)
@Controller({ path: 'admin/partner-keys', version: '1' })
export class PartnerKeyController {
  constructor(private readonly keys: PartnerKeyService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Issue a new partner API key. Returns the raw key ONCE.' })
  async issue(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePartnerKeyDto,
    @Req() req: Request,
  ) {
    const result = await this.keys.issueKey(user, dto, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return {
      // The raw key is the ONLY field in this payload that will not be
      // retrievable again. The client must store it now.
      rawKey: result.rawKey,
      key: {
        id: result.record.id,
        tenantId: result.record.tenantId,
        label: result.record.label,
        keyPrefix: result.record.keyPrefix,
        scopes: result.record.scopes,
        plan: result.record.plan,
        status: result.record.status,
        expiresAt: result.record.expiresAt,
        createdAt: result.record.createdAt,
      },
    };
  }

  @Get()
  @ApiOperation({ summary: 'List partner API keys (optionally filter by ?tenantId=)' })
  @ApiQuery({ name: 'tenantId', required: false, format: 'uuid' })
  list(@Query('tenantId') tenantId?: string) {
    return this.keys.listKeys(tenantId);
  }

  @Patch(':id/plan')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update the commercial plan tier of an existing key' })
  updatePlan(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePartnerKeyPlanDto,
    @Req() req: Request,
  ) {
    return this.keys.updatePlan(user, id, dto.plan, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Get(':id/usage')
  @ApiOperation({ summary: 'Daily request count history for one key' })
  @ApiQuery({ name: 'limit', required: false, description: 'Max days (1-365, default 90)' })
  usage(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('limit', new DefaultValuePipe(90), ParseIntPipe) limit?: number,
  ) {
    return this.keys.listUsage(id, limit);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke a partner API key' })
  revoke(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    return this.keys.revokeKey(user, id, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }
}
