import {
  Body,
  Controller,
  Delete,
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
import { CreateWebhookSubscriptionDto } from './dto/create-webhook-subscription.dto';
import { WebhookService } from './webhook.service';

/**
 * Internal management of partner webhook subscriptions (PDF §43, §39).
 * SUPER_ADMIN only — the raw HMAC secret is shown exactly ONCE in the
 * creation response.
 */
@ApiTags('Webhook Subscriptions (internal)')
@ApiBearerAuth()
@Roles(MembershipRole.SUPER_ADMIN)
@Controller({ path: 'admin/webhook-subscriptions', version: '1' })
export class WebhookAdminController {
  constructor(private readonly webhooks: WebhookService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a webhook subscription. Returns the HMAC secret ONCE.' })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateWebhookSubscriptionDto,
    @Req() req: Request,
  ) {
    const result = await this.webhooks.createSubscription(user, dto, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return {
      // The rawSecret is unretrievable after this response — capture it now.
      rawSecret: result.rawSecret,
      subscription: result.record,
    };
  }

  @Get()
  @ApiOperation({ summary: 'List webhook subscriptions (optionally filter by ?tenantId=)' })
  @ApiQuery({ name: 'tenantId', required: false, format: 'uuid' })
  list(@Query('tenantId') tenantId?: string) {
    return this.webhooks.listSubscriptions(tenantId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke a webhook subscription' })
  revoke(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    return this.webhooks.revokeSubscription(user, id, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Get(':id/deliveries')
  @ApiOperation({ summary: 'Recent delivery attempts for a subscription (debugging)' })
  deliveries(@Param('id', ParseUUIDPipe) id: string) {
    return this.webhooks.listDeliveries(id);
  }
}
