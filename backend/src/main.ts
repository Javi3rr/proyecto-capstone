import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Todas las rutas quedan bajo /api (Nginx redirige /api -> este servicio)
  app.setGlobalPrefix('api');

  // Detrás de Nginx: confiar en X-Forwarded-For para registrar la IP real
  app.getHttpAdapter().getInstance().set('trust proxy', true);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // En desarrollo (ng serve en :4200) se permite CORS; en Docker todo pasa por Nginx (mismo origen)
  if (process.env.NODE_ENV !== 'production') {
    app.enableCors({ origin: ['http://localhost:4200'], credentials: true });
  }

  app.enableShutdownHooks();

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port, '0.0.0.0');
  Logger.log(`API Patopan escuchando en http://localhost:${port}/api`, 'Bootstrap');
}

bootstrap();
