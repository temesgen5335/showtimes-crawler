// Load .env before any module decorators are evaluated (the BullMQ worker
// options in crawl.processor.ts read process.env at decoration time).
import 'dotenv/config';

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Crawler API')
    .setDescription(
      'Queue-based web crawler. Enqueue a URL, poll its status, cancel it. ' +
        'Jobs are processed by a BullMQ worker backed by Redis.',
    )
    .setVersion('1.0')
    .addTag('crawl')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);

  const port = process.env.PORT ?? 3333;
  const boardRoute = process.env.BULL_BOARD_ROUTE ?? '/admin/queues';
  // Bind to 0.0.0.0 so the app is reachable inside containers / on Render,
  // where the platform injects PORT and routes to the container's interface.
  await app.listen(port, '0.0.0.0');
  // eslint-disable-next-line no-console
  console.log(
    `Crawler API listening on http://localhost:${port}\n` +
      `  Swagger UI     → http://localhost:${port}/docs\n` +
      `  Queue dashboard → http://localhost:${port}${boardRoute}`,
  );
}
void bootstrap();
