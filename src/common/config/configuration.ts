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
  jwt: { secret: string; accessTtl: string; refreshTtlDays: number };
  cors: { origins: string[] };
  swagger: { enabled: boolean };
  logLevel: string;
  throttle: { ttlMs: number; limit: number };
  /** Optional. Base URL of the external Python AI service. If unset, in-process stubs are used. */
  aiServiceUrl?: string;
  /** Timeout (ms) for authenticity calls — heavy vision/voice models are slow,
   *  especially the first (model-loading) call, so this is much larger than the
   *  default AI client timeout. */
  aiAuthenticityTimeoutMs: number;
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
  jwt: {
    secret: process.env.JWT_SECRET ?? '',
    accessTtl: process.env.JWT_ACCESS_TTL ?? '15m',
    refreshTtlDays: parseInt(process.env.JWT_REFRESH_TTL_DAYS ?? '7', 10),
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
  aiServiceUrl: process.env.AI_SERVICE_URL || undefined,
  aiAuthenticityTimeoutMs: parseInt(process.env.AI_AUTHENTICITY_TIMEOUT_MS ?? '120000', 10),
});
