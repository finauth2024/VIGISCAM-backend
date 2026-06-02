import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { TenantType } from '@prisma/client';
import { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from './auth.types';

/**
 * Restricts a route to INVESTIGATOR or AGENCY tenants. The investigator
 * console is shared between independent investigators and law-enforcement
 * agencies — they have the same case-workspace needs and the cross-tenant
 * read pattern is identical, so collapsing them into one guard avoids
 * route duplication. Roles (@Roles INVESTIGATOR, AGENCY_ANALYST) still
 * narrow which membership labels can act inside the portal.
 */
@Injectable()
export class InvestigatorTenantGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const user = request.user;
    if (!user) {
      throw new ForbiddenException('Authentication required');
    }
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: user.tenantId },
      select: { type: true, status: true },
    });
    if (!tenant) {
      throw new ForbiddenException('Tenant not found');
    }
    if (tenant.type !== TenantType.INVESTIGATOR && tenant.type !== TenantType.AGENCY) {
      throw new ForbiddenException(
        'Investigator console is restricted to investigator or agency tenants',
      );
    }
    if (tenant.status !== 'ACTIVE') {
      throw new ForbiddenException('Tenant is not active');
    }
    return true;
  }
}
