import { createServer } from 'node:http';
import { Counter, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

export type WorkerMetrics = {
  registry: Registry;
  messagesTotal: Counter<'outcome'>;
  rowsTotal: Counter;
  issuesTotal: Counter;
  jobDuration: Histogram;
};

export function createMetrics(): WorkerMetrics {
  const registry = new Registry();
  collectDefaultMetrics({ register: registry });

  const messagesTotal = new Counter({
    name: 'sop_ingestion_messages_total',
    help: 'Mensagens de ingestão por desfecho',
    labelNames: ['outcome'] as const,
    registers: [registry],
  });

  const rowsTotal = new Counter({
    name: 'sop_ingestion_rows_total',
    help: 'Linhas de dataset processadas',
    registers: [registry],
  });

  const issuesTotal = new Counter({
    name: 'sop_ingestion_issues_total',
    help: 'Linhas inválidas acumuladas no relatório',
    registers: [registry],
  });

  const jobDuration = new Histogram({
    name: 'sop_ingestion_job_duration_seconds',
    help: 'Duração do job de ingestão',
    buckets: [0.1, 0.5, 1, 5, 15, 30, 60],
    registers: [registry],
  });

  return { registry, messagesTotal, rowsTotal, issuesTotal, jobDuration };
}

export function startMetricsServer(registry: Registry, port: number): void {
  const server = createServer(async (_req, res) => {
    res.writeHead(200, { 'Content-Type': registry.contentType });
    res.end(await registry.metrics());
  });
  server.listen(port);
}
