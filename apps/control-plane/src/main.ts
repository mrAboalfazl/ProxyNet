import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app/app.module';
import { buildPublicOpenApiDocument } from './docs/public-openapi';

// Allow BigInt serialization to JSON
(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function () {
  return this.toString();
};

async function bootstrap() {
  // rawBody: true preserves the untouched request body on req.rawBody so the forwarder
  // proxy can pass through binary/JSON/form bodies unchanged even after body-parser runs.
  const app = await NestFactory.create(AppModule, { rawBody: true });

  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: false, transform: true }));
  app.enableCors();

  const publicBase =
    process.env.NEXT_PUBLIC_PUBLIC_API_BASE?.trim() ||
    'https://panel.civonex.ir';
  const publicDoc = buildPublicOpenApiDocument(publicBase);
  SwaggerModule.setup('api/docs', app, publicDoc);

  if (process.env.ENABLE_INTERNAL_SWAGGER === 'true') {
    const internalConfig = new DocumentBuilder()
      .setTitle('Proxy Platform — Internal Control Plane API')
      .setDescription('Full internal & admin API (development only)')
      .setVersion('1.3.0')
      .addBearerAuth()
      .build();
    const internalDoc = SwaggerModule.createDocument(app, internalConfig);
    SwaggerModule.setup('api/internal-docs', app, internalDoc);
  }

  const port = process.env.APP_PORT || process.env.PORT || 3000;
  const host = process.env.HOST || '127.0.0.1';
  await app.listen(port, host);
  Logger.log(`Control Plane running on http://${host}:${port}/api`);
  Logger.log(`Public OpenAPI JSON at http://localhost:${port}/api/openapi.json`);
  Logger.log(`Public Swagger UI at http://localhost:${port}/api/docs`);
}

bootstrap();
