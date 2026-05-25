import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { PartnerPrincipal } from './partner.types';

/**
 * Injects the partner principal (or one of its fields) into a handler:
 *   @CurrentPartner() partner: PartnerPrincipal
 *   @CurrentPartner('tenantId') tenantId: string
 */
export const CurrentPartner = createParamDecorator(
  (field: keyof PartnerPrincipal | undefined, ctx: ExecutionContext) => {
    const request = ctx
      .switchToHttp()
      .getRequest<Request & { partner?: PartnerPrincipal }>();
    const partner = request.partner;
    return field && partner ? partner[field] : partner;
  },
);
