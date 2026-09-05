import { buildApp } from './app.js';
import type { AppDependencies } from './composition/ports.js';

const PORT = Number(process.env.API_PORT ?? 3001);

// TODO: T054 — substituir stubs pelos adaptadores concretos (Prisma, RabbitMQ, MinIO)
const deps: AppDependencies = {
  health: {
    checkDatabase: async () => true,
    checkBroker: async () => true,
    checkObjectStore: async () => true,
  },
};

const app = await buildApp(deps);

try {
  await app.listen({ port: PORT, host: '0.0.0.0' });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
