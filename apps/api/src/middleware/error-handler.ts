import type { FastifyInstance } from 'fastify';
import { hasZodFastifySchemaValidationErrors } from 'fastify-type-provider-zod';

/**
 * Formato único de erro (contracts/http-api-v1.md).
 *
 * `code` é estável e é o que o cliente testa; `message` é para humanos e pode
 * mudar sem quebrar ninguém.
 *
 * Erro inesperado NUNCA vaza detalhe interno para a resposta — mensagem de banco
 * e stack trace expõem schema e caminhos de arquivo. O detalhe vai para o log,
 * correlacionado, onde é útil sem ser público.
 */

export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function registerErrorHandler(app: FastifyInstance): void {
  app.setNotFoundHandler((request, reply) => {
    reply.status(404).send({
      error: {
        code: 'NOT_FOUND',
        message: `rota não encontrada: ${request.method} ${request.url}`,
      },
    });
  });

  app.setErrorHandler((error, request, reply) => {
    if (hasZodFastifySchemaValidationErrors(error)) {
      reply.status(400).send({
        error: {
          code: 'VALIDATION_FAILED',
          message: 'a requisição não atende ao contrato',
          details: error.validation,
        },
      });
      return;
    }

    if (error instanceof AppError) {
      reply.status(error.statusCode).send({
        error: { code: error.code, message: error.message, details: error.details },
      });
      return;
    }

    if (error.statusCode === 429) {
      reply.status(429).send({
        error: { code: 'RATE_LIMITED', message: 'muitas requisições; tente novamente em instantes' },
      });
      return;
    }

    if (typeof error.statusCode === 'number' && error.statusCode < 500) {
      reply.status(error.statusCode).send({
        error: { code: 'VALIDATION_FAILED', message: error.message },
      });
      return;
    }

    request.log.error(
      { err: error, correlationId: request.correlationId },
      'erro não tratado',
    );

    reply.status(500).send({
      error: {
        code: 'INTERNAL',
        message: 'erro interno; use o correlationId para investigar',
        details: { correlationId: request.correlationId },
      },
    });
  });
}
