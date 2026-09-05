import { createMetrics, startMetricsServer } from './observability/metrics.js';
import { logger } from './observability/logger.js';

// TODO: T106 — implementar consumidor de sop.ingestion.request.v1

const METRICS_PORT = Number(process.env.METRICS_PORT ?? 9100);

const metrics = createMetrics();
startMetricsServer(metrics.registry, METRICS_PORT);

logger.info({ metricsPort: METRICS_PORT }, 'ingestion-worker iniciado');

process.on('SIGTERM', () => {
  logger.info('SIGTERM recebido — encerrando');
  process.exit(0);
});
process.on('SIGINT', () => process.exit(0));
