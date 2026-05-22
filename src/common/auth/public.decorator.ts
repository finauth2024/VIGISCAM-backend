import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marks a route as public — exempt from the global JWT auth guard.
 * Everything is authenticated by default; opt out explicitly with @Public().
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
