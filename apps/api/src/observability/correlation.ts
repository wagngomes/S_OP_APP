import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';

/**
 * Propagação do `correlationId` (Princípio IX).
 *
 * Nasce na borda HTTP e viaja daqui até o envelope de toda mensagem, para que um
 * cálculo seja seguível atravessando API, worker de ingestão e motor. Sem isso,
 * diagnosticar um número errado no plano vira arqueologia de timestamp.
 *
 * A correlação é injetada como `genReqId`, e não apenas num hook `onRequest`.
 * A diferença importa: o Fastify emite a linha "incoming request" ANTES de
 * qualquer hook rodar, então um hook deixaria justamente a primeira linha de cada
 * requisição sem correlação — e é ela que marca o começo da operação. Sendo o
 * `reqId`, o identificador aparece em TODA linha de log automaticamente.
 */

export const CORRELATION_HEADER = 'x-correlation-id';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

declare module 'fastify' {
  interface FastifyRequest {
    correlationId: string;
  }
}

type IncomingLike = { headers: Record<string, string | string[] | undefined> };

/**
 * Extrai a correlação do cabeçalho ou gera uma nova.
 *
 * Valor malformado é substituído em vez de propagado: um identificador que não
 * casa entre serviços é pior que um novo, porque parece correlacionado.
 */
export function correlationIdFrom(request: IncomingLike): string {
  const incoming = request.headers[CORRELATION_HEADER];
  const candidate = Array.isArray(incoming) ? incoming[0] : incoming;
  return candidate && UUID.test(candidate) ? candidate : randomUUID();
}

export function registerCorrelation(app: FastifyInstance): void {
  app.decorateRequest('correlationId', '');

  app.addHook('onRequest', async (request: FastifyRequest, reply) => {
    // `request.id` já é a correlação, por conta do `genReqId`.
    request.correlationId = String(request.id);
    reply.header(CORRELATION_HEADER, request.correlationId);
  });
}
