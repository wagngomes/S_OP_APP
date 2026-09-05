import { createMetrics, startMetricsServer } from './observability/metrics.js';
import { logger } from './observability/logger.js';

// TODO: T159 — implementar consumidor de sop.email.request.v1

const METRICS_PORT = Number(process.env.METRICS_PORT ?? 9101);

const metrics = createMetrics();
startMetricsServer(metrics.registry, METRICS_PORT);

logger.info({ metricsPort: METRICS_PORT }, 'email-worker iniciado');

process.on('SIGTERM', () => {
  logger.info('SIGTERM recebido — encerrando');
  process.exit(0);
});
process.on('SIGINT', () => process.exit(0));
