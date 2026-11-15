import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  // The web app runs on another origin in development; cookies need credentials (ADR-001).
  app.enableCors({ origin: config.get<string>('WEB_ORIGIN', 'http://localhost:3000'), credentials: true });
  app.enableShutdownHooks();

  const port = config.get<number>('API_PORT', 4000);
  await app.listen(port);
  Logger.log(`Prodlike API listening on http://localhost:${port}`, 'Bootstrap');
}

void bootstrap();
