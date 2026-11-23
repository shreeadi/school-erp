import 'reflect-metadata';
import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module.js';
import { requestContextMiddleware } from './common/request-context.middleware.js';
import { loadConfig, SESSION_COOKIE } from './config/env.js';

export async function createApp(options: { logger?: boolean } = {}): Promise<INestApplication> {
  const cfg = loadConfig();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: options.logger === false ? false : undefined });
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(cookieParser());
  app.use(requestContextMiddleware);
  app.enableCors({ origin: cfg.corsOrigins, credentials: true });
  app.setGlobalPrefix('api/v1', { exclude: ['health'] });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.enableShutdownHooks();

  const doc = new DocumentBuilder()
    .setTitle('School ERP API')
    .setDescription('Multi-tenant School ERP. The school is always derived from the signed-in session, never from request input.')
    .setVersion('0.1.0')
    .addCookieAuth(SESSION_COOKIE)
    .addBearerAuth()
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, doc));
  return app;
}
