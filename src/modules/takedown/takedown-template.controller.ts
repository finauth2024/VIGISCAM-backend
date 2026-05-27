import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { MembershipRole } from '@prisma/client';
import { AuthenticatedUser } from '../../common/auth/auth.types';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { CreateTakedownTemplateDto } from './dto/create-takedown-template.dto';
import { TakedownAutomationService } from './takedown-automation.service';

/**
 * Admin management of the provider-template registry that drives Phase 7D
 * takedown automation. SUPER_ADMIN only.
 */
@ApiTags('Takedown Templates (internal)')
@ApiBearerAuth()
@Roles(MembershipRole.SUPER_ADMIN)
@Controller({ path: 'admin/takedown-templates', version: '1' })
export class TakedownTemplateController {
  constructor(private readonly automation: TakedownAutomationService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register a new provider template' })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateTakedownTemplateDto) {
    return this.automation.createTemplate({
      providerType: dto.providerType,
      providerName: dto.providerName,
      detectorPattern: dto.detectorPattern,
      abuseContact: dto.abuseContact ?? null,
      detailsTemplate: dto.detailsTemplate,
      enabled: dto.enabled ?? true,
      priority: dto.priority ?? 0,
      createdByUserId: user.userId,
    });
  }

  @Get()
  @ApiOperation({ summary: 'List provider templates' })
  @ApiQuery({ name: 'providerType', required: false })
  @ApiQuery({ name: 'enabled', required: false, description: 'true / false' })
  list(@Query('providerType') providerType?: string, @Query('enabled') enabled?: string) {
    const enabledFilter = enabled === undefined ? undefined : enabled === 'true';
    return this.automation.listTemplates({ providerType, enabled: enabledFilter });
  }
}
