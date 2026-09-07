import amqplib from 'amqplib';
import { CreateBucketCommand, HeadBucketCommand } from '@aws-sdk/client-s3';
import { PrismaClient } from '@prisma/client';
import { buildApp } from './app.js';
import type { AppDependencies } from './composition/ports.js';
import { createAuth, createAuthenticator, createAuthPort } from './adapters/auth/better-auth.js';
import { MinioObjectStore, createS3Client } from './adapters/minio/object-store.js';
import { StubDatasetExporter } from './adapters/minio/dataset-exporter.js';
import { StubParquetReader } from './adapters/minio/parquet-reader.js';
import { assertTopology, QUEUES } from './adapters/rabbitmq/topology.js';
import { RabbitMQPublisher } from './adapters/rabbitmq/publisher.js';
import { RabbitMQNotificationPort } from './adapters/rabbitmq/notification.js';
import { ForecastResultConsumer } from './adapters/rabbitmq/forecast-result.consumer.js';
import { withRetry } from './adapters/rabbitmq/retry.js';
import { PrismaScenarioRepository } from './adapters/prisma/scenario.repository.js';
import { PrismaMembershipRepository } from './adapters/prisma/membership.repository.js';
import { PrismaIngestionRepository } from './adapters/prisma/ingestion.repository.js';
import { PrismaForecastRepository } from './adapters/prisma/forecast.repository.js';
import { PrismaForecastItemRepository } from './adapters/prisma/forecast-item.repository.js';

const PORT = Number(process.env.API_PORT ?? 3001);
const AMQP_URL = process.env.AMQP_URL ?? 'amqp://sop:troque-em-producao@localhost:5672';
const S3_BUCKET = process.env.S3_BUCKET ?? 'sop';

// ─── Prisma ──────────────────────────────────────────────────────────────────

const prisma = new PrismaClient();

// ─── Repositórios ────────────────────────────────────────────────────────────

const scenarios = new PrismaScenarioRepository(prisma);
const membership = new PrismaMembershipRepository(prisma);
const ingestion = new PrismaIngestionRepository(prisma);
const forecast = new PrismaForecastRepository(prisma);
const forecastItems = new PrismaForecastItemRepository(prisma);

// ─── Auth ────────────────────────────────────────────────────────────────────

const auth = createAuth(prisma);
const authenticator = createAuthenticator(auth);
const authPort = createAuthPort(auth);

// ─── MinIO / S3 ──────────────────────────────────────────────────────────────

const s3 = createS3Client();

const datasets = new MinioObjectStore(s3);
const datasetExporter = new StubDatasetExporter();
const parquet = new StubParquetReader();

// ─── RabbitMQ ────────────────────────────────────────────────────────────────

const amqpConn = await amqplib.connect(AMQP_URL);
let brokerAlive = true;
amqpConn.on('error', () => { brokerAlive = false; });
amqpConn.on('close', () => { brokerAlive = false; });

const publishChannel = await amqpConn.createChannel();
const consumeChannel = await amqpConn.createChannel();

await assertTopology(publishChannel);

const publisher = new RabbitMQPublisher(publishChannel);
const notification = new RabbitMQNotificationPort(publishChannel);

// ─── Consumidor de resultado de previsão ─────────────────────────────────────

const forecastResultConsumer = new ForecastResultConsumer(
  forecast,
  forecastItems,
  parquet,
  scenarios,
  membership,
  notification,
);

await consumeChannel.prefetch(1);
await consumeChannel.consume(QUEUES.FORECAST_RESULT, async (msg) => {
  if (!msg) return;
  await withRetry(consumeChannel, msg, QUEUES.FORECAST_RESULT, async () => {
    const payload = JSON.parse(msg.content.toString()) as unknown;
    await forecastResultConsumer.process(payload);
  });
});

// ─── MinIO bucket ────────────────────────────────────────────────────────────

try {
  await s3.send(new HeadBucketCommand({ Bucket: S3_BUCKET }));
} catch {
  await s3.send(new CreateBucketCommand({ Bucket: S3_BUCKET }));
}

// ─── Health checks ───────────────────────────────────────────────────────────

const health: AppDependencies['health'] = {
  async checkDatabase() {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  },
  checkBroker: async () => brokerAlive,
  async checkObjectStore() {
    try {
      await s3.send(new HeadBucketCommand({ Bucket: S3_BUCKET }));
      return true;
    } catch {
      return false;
    }
  },
};

// ─── App ─────────────────────────────────────────────────────────────────────

const deps: AppDependencies = {
  health,
  auth: authenticator,
  authPort,
  ingestion,
  forecast,
  forecastItems,
  scenarios,
  publisher,
  datasets,
  datasetExporter,
  parquet,
  membership,
  notification,
};

const app = await buildApp(deps);

try {
  await app.listen({ port: PORT, host: '0.0.0.0' });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

// ─── Graceful shutdown ───────────────────────────────────────────────────────

async function shutdown(): Promise<void> {
  await app.close();
  await publishChannel.close().catch(() => undefined);
  await consumeChannel.close().catch(() => undefined);
  await amqpConn.close().catch(() => undefined);
  await prisma.$disconnect();
}

process.on('SIGTERM', () => void shutdown().then(() => process.exit(0)));
process.on('SIGINT', () => void shutdown().then(() => process.exit(0)));
