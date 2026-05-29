/**
 * Boot the Nest app in "spec only" mode and dump the OpenAPI document to
 * openapi.json. Used by `npm run openapi:export`, which is consumed by the
 * type generation script and the schema-diff CI gate.
 *
 * No HTTP listener is started — we just construct the application context
 * far enough to build the Swagger document, then exit.
 */
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { writeFileSync } from 'fs';
import { resolve } from 'path';
import { AppModule } from '../src/app.module';

async function main(): Promise<void> {
  const app = await NestFactory.create(AppModule, { logger: false });
  // Match main.ts so paths line up with what's actually served.
  app.setGlobalPrefix(process.env.API_PREFIX ?? 'api');

  const config = new DocumentBuilder()
    .setTitle('VIGISCAM Backend API')
    .setDescription('VIGISCAM main backend — REST API. Phase 7 verified.')
    .setVersion('0.7.0')
    .addBearerAuth()
    .build();

  const doc = SwaggerModule.createDocument(app, config);
  const out = resolve(process.cwd(), 'openapi.json');
  writeFileSync(out, JSON.stringify(doc, null, 2), 'utf8');
  await app.close();
  // eslint-disable-next-line no-console
  console.log(`OpenAPI spec written to ${out}`);
}

void main();
