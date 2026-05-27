import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import configuration from './common/config/configuration';
import { validateEnv } from './common/config/env.validation';
import { JwtAuthGuard } from './common/auth/jwt-auth.guard';
import { RolesGuard } from './common/auth/roles.guard';
import { CacheModule } from './common/cache/cache.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { PrismaModule } from './common/prisma/prisma.module';
import { A1ScamShieldModule } from './modules/a1scamshield/a1scamshield.module';
import { AgencyFeedsModule } from './modules/agency-feeds/agency-feeds.module';
import { AiModule } from './modules/ai/ai.module';
import { AlertsModule } from './modules/alerts/alerts.module';
import { AuthModule } from './modules/auth/auth.module';
import { AuthenticityModule } from './modules/authenticity/authenticity.module';
import { ClusteringModule } from './modules/clustering/clustering.module';
import { DetectionRulesModule } from './modules/detection-rules/detection-rules.module';
import { DevicesModule } from './modules/devices/devices.module';
import { EvidenceModule } from './modules/evidence-vault/evidence.module';
import { FamiliesModule } from './modules/families/families.module';
import { FraudGraphModule } from './modules/fraud-graph/fraud-graph.module';
import { FreezeGuardModule } from './modules/freezeguard/freezeguard.module';
import { FreezeLockModule } from './modules/freezelock/freezelock.module';
import { HealthModule } from './modules/health/health.module';
import { IntelligenceMetricsModule } from './modules/intelligence-metrics/intelligence-metrics.module';
import { InternalAdminModule } from './modules/internal-admin/internal-admin.module';
import { OsintModule } from './modules/osint/osint.module';
import { PartnerIntelligenceModule } from './modules/partner-intelligence/partner-intelligence.module';
import { PartnerKeysModule } from './modules/partner-keys/partner-keys.module';
import { PublicAlertsModule } from './modules/public-alerts/public-alerts.module';
import { RegistryModule } from './modules/registry/registry.module';
import { ReviewQueueModule } from './modules/review-queue/review-queue.module';
import { RiskFusionV2Module } from './modules/risk-fusion-v2/risk-fusion-v2.module';
import { RiskModule } from './modules/risk-fusion/risk.module';
import { ScamCheckModule } from './modules/scam-check/scam-check.module';
import { ScamSignalsModule } from './modules/scam-signals/scam-signals.module';
import { SessionsModule } from './modules/sessions/sessions.module';
import { TakedownModule } from './modules/takedown/takedown.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';

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
    CacheModule,
    EvidenceModule,
    AlertsModule,
    HealthModule,
    AuthModule,
    DevicesModule,
    SessionsModule,
    FreezeLockModule,
    RiskModule,
    FreezeGuardModule,
    A1ScamShieldModule,
    FamiliesModule,
    ScamSignalsModule,
    ScamCheckModule,
    RegistryModule,
    ReviewQueueModule,
    TakedownModule,
    InternalAdminModule,
    ClusteringModule,
    DetectionRulesModule,
    IntelligenceMetricsModule,
    PartnerKeysModule,
    PartnerIntelligenceModule,
    WebhooksModule,
    AiModule,
    FraudGraphModule,
    AuthenticityModule,
    RiskFusionV2Module,
    OsintModule,
    AgencyFeedsModule,
    PublicAlertsModule,
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
