import { ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { buildCorsMatchers, isOriginAllowed } from './common/cors/cors-matcher';
// Side-effect import — teaches JSON.stringify how to serialize a bigint.
// MUST come before NestFactory.create so Prisma `@db.BigInt` fields
// (e.g. scamhold_events.amountMinor) round-trip through HTTP responses.
import './common/json/bigint-shim';

async function bootstrap(): Promise<void> {
  // `rawBody: true` preserves the unparsed request body on req.rawBody so
  // the Stripe webhook (Phase 11A) can verify the payload signature.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    rawBody: true,
  });

  // Raise the body-size limit well above Express's 100 KB default: the
  // Authenticity Verification Suite accepts media inline as base64
  // (`imageBase64`/`audioBase64`) so the AI worker can run deepfake / voice
  // inference. The worker caps decoded media at 25 MB; base64 inflates by
  // ~33%, so 40 MB covers a full-size payload + JSON envelope. Without this,
  // every real image/audio authenticity call fails with PayloadTooLargeError.
  app.useBodyParser('json', { limit: '40mb' });
  app.useBodyParser('urlencoded', { limit: '40mb', extended: true });

  // Route all framework logs through pino (structured logging).
  app.useLogger(app.get(Logger));
  const logger = app.get(Logger);
  const config = app.get(ConfigService);

  const apiPrefix = config.get<string>('apiPrefix', 'api');
  const port = config.get<number>('port', 3000);
  const corsOrigins = config.get<string[]>('cors.origins', []);
  const swaggerEnabled = config.get<boolean>('swagger.enabled', true);

  // Security headers.
  app.use(helmet());

  // CORS — only explicitly allowed origins. `CORS_ORIGINS` is comma-separated;
  // entries containing `*` are matched as globs (see common/cors/cors-matcher),
  // so a single entry like `https://*.vercel.app` covers every Vercel preview
  // deploy without the env var being updated per branch.
  const corsMatchers = buildCorsMatchers(corsOrigins);
  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ): void => {
      const allowed = isOriginAllowed(corsMatchers, origin);
      callback(allowed ? null : new Error('Not allowed by CORS'), allowed);
    },
    credentials: true,
  });

  // Routes become /<prefix>/v<version>/... e.g. /api/v1/health/live
  app.setGlobalPrefix(apiPrefix);
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  // Validate and strip every incoming payload (a guardrail).
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.enableShutdownHooks();

  if (swaggerEnabled) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('VIGISCAM Backend API')
      .setDescription('VIGISCAM main backend — REST API. Phase 0 foundation.')
      .setVersion('0.1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup(`${apiPrefix}/docs`, app, document, {
      swaggerOptions: { persistAuthorization: true },
    });
  }

  await app.listen(port);
  logger.log(
    `VIGISCAM backend listening on port ${port} — base path /${apiPrefix}` +
      (swaggerEnabled ? `, docs at /${apiPrefix}/docs` : ''),
    'Bootstrap',
  );
}

void bootstrap();
