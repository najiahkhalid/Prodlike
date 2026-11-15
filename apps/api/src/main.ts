import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import type { Env } from './config/env';

/** Shared app setup, also used by the integration tests. */
export function configureApp(app: NestExpressApplication) {
  const config = app.get(ConfigService<Env, true>);
  // Behind Caddy / the Next.js proxy: trust X-Forwarded-For so rate limits see the real client IP.
  app.set('trust proxy', 1);
  app.use(cookieParser());
  app.useGlobalFilters(new AllExceptionsFilter());
  // The browser normally calls the API through the web app's /api proxy (same origin);
  // CORS with credentials covers direct calls during development.
  app.enableCors({ origin: config.get('WEB_ORIGIN', { infer: true }), credentials: true });
  app.enableShutdownHooks();
  return app;
}

async function bootstrap() {
  const app = configureApp(await NestFactory.create<NestExpressApplication>(AppModule));
  const port = app.get(ConfigService<Env, true>).get('API_PORT', { infer: true });
  await app.listen(port);
  Logger.log(`Prodlike API listening on http://localhost:${port}`, 'Bootstrap');
}

if (require.main === module) void bootstrap();
