import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
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
import { CreateDetectionRuleDto } from './dto/create-detection-rule.dto';
import { UpdateDetectionRuleStatusDto } from './dto/update-detection-rule-status.dto';
import { UpdateDetectionRuleDto } from './dto/update-detection-rule.dto';
import { DetectionRuleService } from './detection-rule.service';

/**
 * Detection-rule pattern library (PDF §29.7, §33). Internal only — rules are
 * private intelligence. The no-auto-activation guardrail is enforced inside
 * the service (DRAFT cannot go directly to ACTIVE; only admin/compliance can
 * push a rule to ACTIVE).
 */
@ApiTags('Detection Rules (internal)')
@ApiBearerAuth()
@Roles(MembershipRole.REVIEWER, MembershipRole.SUPER_ADMIN, MembershipRole.COMPLIANCE_OFFICER)
@Controller({ path: 'intelligence/rules', version: '1' })
export class DetectionRuleController {
  constructor(private readonly rules: DetectionRuleService) {}

  @Get()
  @ApiOperation({ summary: 'List detection rules (optionally filter by ?status= and ?ruleType=)' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'ruleType', required: false })
  list(@Query('status') status?: string, @Query('ruleType') ruleType?: string) {
    return this.rules.list(status, ruleType);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single detection rule' })
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.rules.get(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a detection rule (always lands as DRAFT)' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateDetectionRuleDto,
    @Req() req: Request,
  ) {
    return this.rules.create(user, dto, { ip: req.ip, userAgent: req.headers['user-agent'] });
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Edit a rule (blocked for ACTIVE / RETIRED rules)' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDetectionRuleDto,
    @Req() req: Request,
  ) {
    return this.rules.update(user, id, dto, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Post(':id/status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Transition a rule to a new lifecycle status' })
  updateStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDetectionRuleStatusDto,
    @Req() req: Request,
  ) {
    return this.rules.updateStatus(user, id, dto, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }
}
