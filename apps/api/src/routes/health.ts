import type { FastifyInstance } from 'fastify';
import type { HealthChecks } from '../composition/ports.js';

/**
 * Saúde da API.
 *
 * A separação entre liveness e readiness é deliberada: uma falha temporária do
 * RabbitMQ ou do MinIO deve tirar a instância do balanceamento, não derrubar o
 * contêiner. Por isso o healthcheck do Docker aponta para `/api/health`, que
 * verifica só o essencial para servir — o banco.
 *
 * Ficam fora do versionamento: são superfície de operação, não de negócio.
 */

async function safe(check: () => Promise<boolean>): Promise<'up' | 'down'> {
  try {
    return (await check()) ? 'up' : 'down';
  } catch {
    // Uma verificação que lança é uma dependência fora, não um erro da rota.
    return 'down';
  }
}

export function registerHealthRoutes(app: FastifyInstance, health: HealthChecks): void {
  app.get('/api/health', { schema: { hide: true } }, async (_request, reply) => {
    const database = await safe(() => health.checkDatabase());
    const status = database === 'up' ? 'ok' : 'degraded';
    return reply.status(database === 'up' ? 200 : 503).send({ status, database });
  });

  app.get('/api/health/ready', { schema: { hide: true } }, async (_request, reply) => {
    const [database, broker, objectStore] = await Promise.all([
      safe(() => health.checkDatabase()),
      safe(() => health.checkBroker()),
      safe(() => health.checkObjectStore()),
    ]);

    const ready = database === 'up' && broker === 'up' && objectStore === 'up';
    return reply
      .status(ready ? 200 : 503)
      .send({ status: ready ? 'ready' : 'not-ready', database, broker, objectStore });
  });
}
