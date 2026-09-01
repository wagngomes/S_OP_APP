import type { FastifyServerOptions } from 'fastify';

/**
 * Log estruturado em JSON (Princípio IX).
 *
 * Cada registro carrega `correlationId`, para que a mesma operação seja
 * reconstituível atravessando os serviços.
 *
 * Campos sensíveis são redigidos: log é operacional e vai para agregador; senha,
 * cookie e token não podem viajar junto.
 */
export function loggerOptions(): FastifyServerOptions['logger'] {
  return {
    level: process.env.LOG_LEVEL ?? 'info',
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'req.body.password',
        'res.headers["set-cookie"]',
      ],
      censor: '[redigido]',
    },
    serializers: {
      req(request: { method: string; url: string; correlationId?: string }) {
        return {
          method: request.method,
          url: request.url,
          correlationId: request.correlationId,
        };
      },
    },
  };
}
