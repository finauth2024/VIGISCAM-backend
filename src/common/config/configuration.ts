/**
 * Typed configuration factory. Consumed via `ConfigService.get('...')`.
 * Reads only validated environment variables (see env.validation.ts).
 */
export interface AppConfiguration {
  nodeEnv: string;
  port: number;
  apiPrefix: string;
  database: { url: string };
  redis: { url?: string };
  cors: { origins: string[] };
  swagger: { enabled: boolean };
  logLevel: string;
  throttle: { ttlMs: number; limit: number };
}

export default (): AppConfiguration => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '3000', 10),
  apiPrefix: process.env.API_PREFIX ?? 'api',
  database: {
    url: process.env.DATABASE_URL ?? '',
  },
  redis: {
    url: process.env.REDIS_URL,
  },
  cors: {
    origins: (process.env.CORS_ORIGINS ?? '')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean),
  },
  swagger: {
    enabled: (process.env.SWAGGER_ENABLED ?? 'true').toLowerCase() === 'true',
  },
  logLevel: process.env.LOG_LEVEL ?? 'info',
  throttle: {
    ttlMs: parseInt(process.env.THROTTLE_TTL_SECONDS ?? '60', 10) * 1000,
    limit: parseInt(process.env.THROTTLE_LIMIT ?? '120', 10),
  },
});
