import {
  ForecastItemsResponse,
  ForecastJobAccepted,
  ForecastJobStatusSchema,
  ForecastSeriesResponse,
  PaginationQuery,
  ScenarioIdParam,
} from '@sop/contracts';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type {
  Authenticator,
  DatasetExporter,
  ForecastRepository,
  JobPublisher,
  ScenarioRepository,
} from '../../composition/ports.js';
import { AppError } from '../../middleware/error-handler.js';
import { ForecastService } from '../../services/forecast.service.js';

/**
 * Rotas do ciclo de cálculo de previsão (T105).
 *
 * POST  /scenarios/:id/forecast-jobs    — dispara o cálculo (FR-051)
 * GET   /scenarios/:id/forecast-jobs/:jobId — status do job
 * GET   /scenarios/:id/forecast-items   — itens paginados (FR-048, FR-052)
 * GET   /scenarios/:id/forecast-series  — séries paginadas
 */
export function registerForecastRoutes(
  app: FastifyInstance,
  deps: {
    auth: Authenticator;
    forecast: ForecastRepository;
    scenarios: ScenarioRepository;
    publisher: JobPublisher;
    exporter: DatasetExporter;
  },
): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const service = new ForecastService(
    deps.forecast,
    deps.scenarios,
    deps.publisher,
    deps.exporter,
  );

  async function requireUser(request: FastifyRequest): Promise<{ id: string }> {
    const user = await deps.auth.currentUser(request.headers);
    if (!user) throw new AppError(401, 'UNAUTHENTICATED', 'autentique-se para acessar este recurso');
    return user;
  }

  async function requireScenario(id: string, userId: string) {
    const scenario = await deps.scenarios.findById(id);
    if (!scenario) throw new AppError(404, 'NOT_FOUND', 'cenário não encontrado');
    if (!(await deps.scenarios.isMember(id, userId))) {
      throw new AppError(404, 'NOT_FOUND', 'cenário não encontrado');
    }
    return scenario;
  }

  typed.post(
    '/scenarios/:id/forecast-jobs',
    {
      schema: {
        summary: 'Dispara o cálculo de previsão',
        description:
          'FR-051 — exporta o dataset, cria o ForecastJob e publica a referência para o motor. ' +
          'Recusa com 409 se já houver job ativo.',
        params: ScenarioIdParam,
        response: { 202: ForecastJobAccepted },
      },
    },
    async (request, reply) => {
      const user = await requireUser(request);
      const scenario = await requireScenario(request.params.id, user.id);
      const job = await service.trigger(scenario, user.id, request.id);
      return reply.status(202).send({ jobId: job.id });
    },
  );

  typed.get(
    '/scenarios/:id/forecast-jobs/:jobId',
    {
      schema: {
        summary: 'Status do job de cálculo',
        description: 'Polling até COMPLETED ou FAILED.',
        params: ScenarioIdParam.extend({ jobId: z.uuid() }),
        response: { 200: ForecastJobStatusSchema },
      },
    },
    async (request) => {
      const user = await requireUser(request);
      await requireScenario(request.params.id, user.id);
      const job = await deps.forecast.findById(request.params.jobId);
      if (!job || job.scenarioId !== request.params.id) {
        throw new AppError(404, 'NOT_FOUND', 'job não encontrado');
      }
      return {
        id: job.id,
        scenarioId: job.scenarioId,
        status: job.status,
        horizonMonths: job.horizonMonths,
        accuracyMetric: job.accuracyMetric as 'WMAPE' | 'MAPE' | 'BIAS',
        modelPackage: job.modelPackage as 'FAST' | 'STANDARD' | 'COMPLETE',
        createdAt: job.createdAt,
        startedAt: job.startedAt,
        finishedAt: job.finishedAt,
        failureReason: job.failureReason,
      };
    },
  );

  typed.get(
    '/scenarios/:id/forecast-items',
    {
      schema: {
        summary: 'Itens de previsão paginados',
        description:
          'FR-048, FR-052 — devolve 409 enquanto o job não concluir. ' +
          'Cada item traz o modelo vencedor e o erro de backtest.',
        params: ScenarioIdParam,
        querystring: PaginationQuery,
        response: { 200: ForecastItemsResponse },
      },
    },
    async (request) => {
      const user = await requireUser(request);
      await requireScenario(request.params.id, user.id);

      const active = await deps.forecast.findActiveByScenario(request.params.id);
      if (active) {
        throw new AppError(
          409,
          'JOB_STILL_RUNNING',
          'o cálculo ainda está em andamento — consulte o status do job',
        );
      }

      const { limit, offset } = request.query;
      // Placeholder — ForecastItemRepository será adicionado com T104
      return { data: [], total: 0, limit, offset };
    },
  );

  typed.get(
    '/scenarios/:id/forecast-series',
    {
      schema: {
        summary: 'Séries de previsão paginadas (agregadas)',
        description: 'Complementa forecast-items com a visão por série.',
        params: ScenarioIdParam,
        querystring: PaginationQuery,
        response: { 200: ForecastSeriesResponse },
      },
    },
    async (request) => {
      const user = await requireUser(request);
      await requireScenario(request.params.id, user.id);

      const active = await deps.forecast.findActiveByScenario(request.params.id);
      if (active) {
        throw new AppError(
          409,
          'JOB_STILL_RUNNING',
          'o cálculo ainda está em andamento — consulte o status do job',
        );
      }

      const { limit, offset } = request.query;
      return { data: [], total: 0, limit, offset };
    },
  );
}
