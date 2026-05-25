import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PartnerApiKeyScope } from '@prisma/client';
import { createHash } from 'crypto';
import { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { PartnerPrincipal } from './partner.types';
import { PARTNER_SCOPES_KEY } from './require-scopes.decorator';

const HEADER = 'x-api-key';

/**
 * Authenticates partner machine-to-machine requests via an `X-API-Key`
 * header. The raw key is hashed and looked up against `partner_api_keys`;
 * a matching ACTIVE (and not-yet-expired) key attaches a PartnerPrincipal to
 * the request as `request.partner` and updates `lastUsedAt`. Optional scope
 * gating via @RequireScopes() is enforced here too.
 *
 * Apply with @UseGuards(ApiKeyGuard) on partner controllers AND mark them
 * @Public() so the JWT guard does not contest the same request.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<Request & { partner?: PartnerPrincipal }>();
    const raw = this.extractKey(request);
    if (!raw) {
      throw new UnauthorizedException('Missing X-API-Key header');
    }

    const keyHash = createHash('sha256').update(raw).digest('hex');
    const key = await this.prisma.partnerApiKey.findUnique({ where: { keyHash } });
    if (!key || key.status !== 'ACTIVE') {
      throw new UnauthorizedException('Invalid or revoked API key');
    }
    if (key.expiresAt && key.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('API key has expired');
    }

    const required = this.reflector.getAllAndOverride<PartnerApiKeyScope[] | undefined>(
      PARTNER_SCOPES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (required && required.length > 0) {
      const missing = required.filter((scope) => !key.scopes.includes(scope));
      if (missing.length > 0) {
        throw new ForbiddenException(
          `API key is missing required scope(s): ${missing.join(', ')}`,
        );
      }
    }

    request.partner = {
      keyId: key.id,
      tenantId: key.tenantId,
      keyPrefix: key.keyPrefix,
      scopes: key.scopes,
    };

    // Best-effort usage timestamp — never fail the request on a write error.
    this.prisma.partnerApiKey
      .update({ where: { id: key.id }, data: { lastUsedAt: new Date() } })
      .catch(() => undefined);

    return true;
  }

  private extractKey(request: Request): string | null {
    const headerValue = request.headers[HEADER];
    if (Array.isArray(headerValue)) {
      return headerValue[0] ?? null;
    }
    return headerValue ?? null;
  }
}
