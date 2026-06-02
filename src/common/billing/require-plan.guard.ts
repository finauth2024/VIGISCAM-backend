import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PartnerApiKeyPlan } from '@prisma/client';
import { Request } from 'express';
import { BillingService } from '../../modules/billing/billing.service';
import { AuthenticatedUser } from '../auth/auth.types';
import { planSatisfies } from './plan-rank';
import { REQUIRE_PLAN_KEY } from './require-plan.decorator';

/**
 * Plan-enforcement guard (Phase 11A). A route with no @RequirePlan() is
 * open. Otherwise the caller tenant's effective plan must satisfy the
 * required minimum tier — a subscription only counts while entitled
 * (ACTIVE/TRIALING/MANUAL), so a lapsed PRO tenant is treated as FREE.
 *
 * Applied per-route via @UseGuards(RequirePlanGuard) (not registered
 * globally) so existing routes are unaffected until explicitly gated.
 */
@Injectable()
export class RequirePlanGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly billing: BillingService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<PartnerApiKeyPlan | undefined>(
      REQUIRE_PLAN_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required) return true;

    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const user = request.user;
    if (!user) {
      throw new ForbiddenException('Authentication required');
    }
    const effective = await this.billing.resolveEffectivePlan(user.tenantId);
    if (!planSatisfies(effective, required)) {
      throw new ForbiddenException(
        `This feature requires the ${required} plan (current: ${effective})`,
      );
    }
    return true;
  }
}
