import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import configuration from './common/config/configuration';
import { validateEnv } from './common/config/env.validation';
import { JwtAuthGuard } from './common/auth/jwt-auth.guard';
import { RolesGuard } from './common/auth/roles.guard';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { PrismaModule } from './common/prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { HealthModule } from './modules/health/health.module';

/**
 * Root module. Wires the cross-cutting foundation:
 *  - typed + validated configuration
 *  - structured (pino) logging with secret redaction
 *  - global rate limiting (a baseline guardrail)
 *  - Prisma database access
 *  - a consistent global error envelope
 * Domain modules (Phase 1+) are registered here as they are built —
 * see src/modules/README.md for the planned module map.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      load: [configuration],
      validate: validateEnv,
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        pinoHttp: {
          level: config.get<string>('logLevel', 'info'),
          transport:
            config.get<string>('nodeEnv') !== 'production'
              ? { target: 'pino-pretty', options: { singleLine: true } }
              : undefined,
          // Guardrail: never log secrets or credentials.
          redact: [
            'req.headers.authorization',
            'req.headers.cookie',
            'req.body.password',
            'req.body.token',
          ],
          customProps: () => ({ service: 'vigiscam-backend' }),
        },
      }),
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          ttl: config.get<number>('throttle.ttlMs', 60_000),
          limit: config.get<number>('throttle.limit', 120),
        },
      ],
    }),
    PrismaModule,
    HealthModule,
    AuthModule,
  ],
  providers: [
    // Order matters: rate-limit first, then authenticate, then authorize.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
