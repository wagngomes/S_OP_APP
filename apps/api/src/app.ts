import { PaginationQuery } from '@sop/contracts';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import Fastify, { type FastifyInstance } from 'fastify';
import {
  type ZodTypeProvider,
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { AppDependencies } from './composition/ports.js';
import { registerErrorHandler } from './middleware/error-handler.js';
import { correlationIdFrom, registerCorrelation } from './observability/correlation.js';
import { loggerOptions } from './observability/logger.js';
import { createMetrics, registerMetrics } from './observability/metrics.js';
import { registerHealthRoutes } from './routes/health.js';

/**
 * Montagem da aplicação.
 *
 * As dependências entram por parâmetro (Princípio IV): em produção vêm os
 * adaptadores concretos, no teste vêm implementações falsas. É isso que permite
 * exercitar o servidor inteiro sem banco, sem fila e sem Docker.
 *
 * Rotas de negócio vivem sob `/api/v1`; saúde e métricas ficam fora do
 * versionamento, porque são superfície de operação e não devem quebrar quando a
 * v2 nascer (contracts/README.md).
 */
export async function buildApp(deps: AppDependencies): Promise<FastifyInstance> {
  const app = Fastify({
    logger: deps.logger ?? loggerOptions(),
    // A correlação é o próprio reqId, para aparecer em TODA linha de log —
    // inclusive na primeira, emitida antes de qualquer hook rodar.
    genReqId: (request) => correlationIdFrom(request as never),
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  registerCorrelation(app);
  registerErrorHandler(app);

  const metrics = createMetrics();
  registerMetrics(app, metrics);

  await app.register(rateLimit, {
    max: Number(process.env.RATE_LIMIT_MAX ?? 300),
    timeWindow: process.env.RATE_LIMIT_WINDOW ?? '1 minute',
  });

  await app.register(swagger, {
    openapi: {
      openapi: '3.1.0',
      info: {
        title: 'SOP_APP — API de orquestração',
        description:
          'Ciclo de S&OP. Grandezas numéricas trafegam como string decimal, nunca como número JSON (Princípio V da constituição).',
        version: '1.0.0',
      },
      servers: [{ url: '/', description: 'raiz' }],
    },
    transform: jsonSchemaTransform,
  });

  await app.register(swaggerUi, { routePrefix: '/api/v1/docs' });

  registerHealthRoutes(app, deps.health);

  await app.register(registerV1Routes, { prefix: '/api/v1' });

  await app.ready();
  return app;
}

/**
 * Rotas versionadas da v1.
 *
 * As rotas de negócio entram aqui conforme as histórias avançam. As duas
 * presentes hoje (`_echo` e `_boom`) são internas e servem de fiação de teste
 * para paginação e tratamento de erro — ficam ocultas da OpenAPI.
 */
async function registerV1Routes(app: FastifyInstance): Promise<void> {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get(
    '/openapi.json',
    { schema: { hide: true } },
    async () => app.swagger(),
  );

  typed.get(
    '/_echo',
    { schema: { hide: true, querystring: PaginationQuery } },
    async (request) => request.query,
  );

  typed.get('/_boom', { schema: { hide: true } }, async () => {
    // Simula uma falha inesperada com detalhe sensível, para provar que ele não
    // vaza na resposta.
    throw new Error('conexão com o banco falhou: senha=segredo');
  });

  // Placeholder documentado enquanto as rotas reais não entram: a OpenAPI
  // precisa ter ao menos um caminho para ser útil desde já.
  typed.get(
    '/model-packages',
    {
      schema: {
        summary: 'Pacotes de modelos disponíveis para o cálculo',
        description:
          'Cada pacote define, junto, os modelos candidatos e a profundidade do backtest (FR-034c).',
        response: {
          200: z.object({
            data: z.array(
              z.object({
                id: z.enum(['FAST', 'STANDARD', 'COMPLETE']),
                models: z.array(z.string()),
                backtestWindows: z.number().int(),
              }),
            ),
          }),
        },
      },
    },
    async () => ({
      data: [
        { id: 'FAST' as const, models: [], backtestWindows: 1 },
        { id: 'STANDARD' as const, models: [], backtestWindows: 3 },
        { id: 'COMPLETE' as const, models: [], backtestWindows: 4 },
      ],
    }),
  );
}
