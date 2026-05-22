import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { AuthenticatedUser } from './auth.types';

/**
 * Injects the authenticated user (or one of its fields) into a handler:
 *   @CurrentUser() user: AuthenticatedUser
 *   @CurrentUser('userId') userId: string
 */
export const CurrentUser = createParamDecorator(
  (field: keyof AuthenticatedUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const user = request.user;
    return field && user ? user[field] : user;
  },
);
