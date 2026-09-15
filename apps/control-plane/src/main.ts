import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app/app.module';

// Allow BigInt serialization to JSON
(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function () {
  return this.toString();
};

async function bootstrap() {
  // rawBody: true preserves the untouched request body on req.rawBody so the forwarder
  // proxy can pass through binary/JSON/form bodies unchanged even after body-parser runs.
  const app = await NestFactory.create(AppModule, { rawBody: true });

  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableCors();

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Proxy Platform — Control Plane API')
    .setDescription('Internal and user-facing API for the managed proxy platform')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.APP_PORT || process.env.PORT || 3000;
  const host = process.env.HOST || '127.0.0.1';
  await app.listen(port, host);
  Logger.log(`Control Plane running on http://${host}:${port}/api`);
  Logger.log(`Swagger docs at http://localhost:${port}/api/docs`);
}

bootstrap();
