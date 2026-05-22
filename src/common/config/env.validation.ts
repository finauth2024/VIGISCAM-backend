import { plainToInstance } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

export enum Environment {
  Development = 'development',
  Staging = 'staging',
  Production = 'production',
  Test = 'test',
}

/**
 * Strongly-typed environment contract. Validated at boot — the app refuses to
 * start with an invalid environment (a guardrail: fail fast, never half-configured).
 */
class EnvironmentVariables {
  @IsOptional()
  @IsEnum(Environment)
  NODE_ENV: Environment = Environment.Development;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT: number = 3000;

  @IsOptional()
  @IsString()
  API_PREFIX: string = 'api';

  // Required — Prisma cannot operate without it.
  @IsString()
  DATABASE_URL!: string;

  @IsOptional()
  @IsString()
  REDIS_URL?: string;

  // Required — auth (JWT signing) cannot operate without it.
  @IsString()
  @MinLength(16)
  JWT_SECRET!: string;

  @IsOptional()
  @IsString()
  JWT_ACCESS_TTL: string = '15m';

  @IsOptional()
  @IsInt()
  @Min(1)
  JWT_REFRESH_TTL_DAYS: number = 7;

  @IsOptional()
  @IsString()
  CORS_ORIGINS: string = '';

  @IsOptional()
  @IsString()
  SWAGGER_ENABLED: string = 'true';

  @IsOptional()
  @IsString()
  LOG_LEVEL: string = 'info';

  @IsOptional()
  @IsInt()
  @Min(1)
  THROTTLE_TTL_SECONDS: number = 60;

  @IsOptional()
  @IsInt()
  @Min(1)
  THROTTLE_LIMIT: number = 120;
}

export function validateEnv(config: Record<string, unknown>): EnvironmentVariables {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validated, { skipMissingProperties: false });
  if (errors.length > 0) {
    const details = errors
      .map((e) => Object.values(e.constraints ?? {}).join(', '))
      .join('; ');
    throw new Error(`Environment validation failed: ${details}`);
  }
  return validated;
}
