import type { FastifyInstance } from 'fastify';
import { Counter, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

/**
 * Exposição Prometheus (Princípio IX).
 *
 * `/metrics` fica FORA do versionamento: é superfície de operação, não de
 * negócio, e não deve quebrar quando a API v2 nascer.
 *
 * Um registro próprio por instância evita que testes que sobem vários `buildApp`
 * colidam no registro global do prom-client.
 */

export type Metrics = {
  registry: Registry;
  httpDuration: Histogram<'method' | 'route' | 'status'>;
  jobsTotal: Counter<'type' | 'outcome'>;
};

export function createMetrics(): Metrics {
  const registry = new Registry();
  collectDefaultMetrics({ register: registry });

  const httpDuration = new Histogram({
    name: 'sop_http_request_duration_seconds',
    help: 'Duração das requisições HTTP',
    labelNames: ['method', 'route', 'status'] as const,
    buckets: [0.005, 0.025, 0.1, 0.5, 1, 5],
    registers: [registry],
  });

  const jobsTotal = new Counter({
    name: 'sop_jobs_total',
    help: 'Jobs por tipo e desfecho',
    labelNames: ['type', 'outcome'] as const,
    registers: [registry],
  });

  return { registry, httpDuration, jobsTotal };
}

export function registerMetrics(app: FastifyInstance, metrics: Metrics): void {
  app.addHook('onResponse', async (request, reply) => {
    // `routeOptions.url` é o padrão da rota, não o caminho concreto: usar o
    // caminho geraria uma série temporal por id e explodiria a cardinalidade.
    const route = request.routeOptions?.url ?? 'unknown';
    metrics.httpDuration.observe(
      { method: request.method, route, status: String(reply.statusCode) },
      reply.elapsedTime / 1000,
    );
  });

  app.get('/metrics', { schema: { hide: true } }, async (_request, reply) => {
    reply.header('content-type', metrics.registry.contentType);
    return metrics.registry.metrics();
  });
}
