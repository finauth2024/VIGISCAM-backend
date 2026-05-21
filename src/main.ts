import { ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

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

  // CORS — only the explicitly allowed origins (the Vercel frontend).
  app.enableCors({
    origin: corsOrigins.length > 0 ? corsOrigins : false,
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
