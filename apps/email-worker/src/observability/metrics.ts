import { createServer } from 'node:http';
import { Counter, Registry, collectDefaultMetrics } from 'prom-client';

export type WorkerMetrics = {
  registry: Registry;
  messagesTotal: Counter<'outcome'>;
  attemptsTotal: Counter<'outcome'>;
};

export function createMetrics(): WorkerMetrics {
  const registry = new Registry();
  collectDefaultMetrics({ register: registry });

  const messagesTotal = new Counter({
    name: 'sop_email_messages_total',
    help: 'Mensagens de e-mail por desfecho',
    labelNames: ['outcome'] as const,
    registers: [registry],
  });

  const attemptsTotal = new Counter({
    name: 'sop_email_attempts_total',
    help: 'Tentativas de envio por desfecho',
    labelNames: ['outcome'] as const,
    registers: [registry],
  });

  return { registry, messagesTotal, attemptsTotal };
}

export function startMetricsServer(registry: Registry, port: number): void {
  const server = createServer(async (_req, res) => {
    res.writeHead(200, { 'Content-Type': registry.contentType });
    res.end(await registry.metrics());
  });
  server.listen(port);
}
