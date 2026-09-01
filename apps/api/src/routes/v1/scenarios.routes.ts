import {
  CreateScenarioBody,
  LevelsResponse,
  ModelPackagesResponse,
  PaginationQuery,
  ParametersBody,
  ParametersResponse,
  ScenarioDetail,
  ScenarioIdParam,
  ScenarioSummary,
  SeriesPreviewQuery,
  SeriesPreviewResponse,
} from '@sop/contracts';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Authenticator, ScenarioRecord, ScenarioRepository } from '../../composition/ports.js';
import { AppError } from '../../middleware/error-handler.js';
import { ScenarioService } from '../../services/scenario.service.js';

/**
 * Rotas de cenário e parametrização.
 *
 * O controller cuida apenas de entrada e saída (Princípio I): resolve o usuário,
 * delega ao service e devolve a resposta. Nenhuma regra de negócio aqui.
 */

function toSummary(s: ScenarioRecord) {
  return {
    id: s.id,
    name: s.name,
    phase: s.phase,
    finalSayRole: s.finalSayRole,
    teamClosed: s.teamClosedAt !== null,
    published: s.publishedAt !== null,
    createdAt: s.createdAt,
  };
}

export function registerScenarioRoutes(
  app: FastifyInstance,
  deps: { auth: Authenticator; scenarios: ScenarioRepository },
): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const service = new ScenarioService(deps.scenarios);

  async function requireUser(request: FastifyRequest): Promise<{ id: string }> {
    const user = await deps.auth.currentUser(request.headers);
    if (!user) {
      throw new AppError(401, 'UNAUTHENTICATED', 'autentique-se para acessar este recurso');
    }
    return user;
  }

  typed.get(
    '/scenarios',
    {
      schema: {
        summary: 'Lista os cenários do usuário com a fase atual',
        description: 'FR-095 — a fase aparece na listagem, sem precisar abrir o cenário.',
        querystring: PaginationQuery,
        response: {
          200: z.object({
            data: z.array(ScenarioSummary),
            total: z.int(),
            limit: z.int(),
            offset: z.int(),
          }),
        },
      },
    },
    async (request) => {
      const user = await requireUser(request);
      const { limit, offset } = request.query;
      const page = await service.list(user.id, { limit, offset });
      return { data: page.data.map(toSummary), total: page.total, limit, offset };
    },
  );

  typed.post(
    '/scenarios',
    {
      schema: {
        summary: 'Cria um cenário',
        description: 'FR-006, FR-007, FR-011 — o criador define quem tem a palavra final.',
        body: CreateScenarioBody,
        response: { 201: ScenarioSummary },
      },
    },
    async (request, reply) => {
      const user = await requireUser(request);
      const created = await service.create({
        name: request.body.name,
        userId: user.id,
        finalSayRole: request.body.finalSayRole,
        forecastHorizonMonths: request.body.forecastHorizonMonths,
      });
      return reply.status(201).send(toSummary(created));
    },
  );

  typed.get(
    '/scenarios/:id',
    {
      schema: {
        summary: 'Detalhe do cenário, com as ações possíveis na fase atual',
        description: 'FR-097 — o usuário sabe o que se espera dele agora.',
        params: ScenarioIdParam,
        response: { 200: ScenarioDetail },
      },
    },
    async (request) => {
      const user = await requireUser(request);
      const scenario = await service.requireAccess(request.params.id, user.id);
      return {
        ...toSummary(scenario),
        forecastHorizonMonths: scenario.forecastHorizonMonths,
        availableActions: service.availableActions(scenario.phase),
      };
    },
  );

  typed.get(
    '/scenarios/:id/levels',
    {
      schema: {
        summary: 'Níveis declarados na importação',
        description: 'FR-031 — são exatamente estes os níveis do campo de arrastar.',
        params: ScenarioIdParam,
        response: { 200: LevelsResponse },
      },
    },
    async (request) => {
      const user = await requireUser(request);
      await service.requireAccess(request.params.id, user.id);
      return { data: await service.levels(request.params.id) };
    },
  );

  typed.put(
    '/scenarios/:id/parameters',
    {
      schema: {
        summary: 'Define a parametrização do cálculo',
        description:
          'FR-032 a FR-036a — combinação de níveis, meses de rateio, pacote de modelos e métrica.',
        params: ScenarioIdParam,
        body: ParametersBody,
        response: { 200: ParametersResponse },
      },
    },
    async (request) => {
      const user = await requireUser(request);
      const scenario = await service.requireAccess(request.params.id, user.id);
      const flags = await service.saveParameters(scenario, request.body);
      return { ...request.body, ...flags };
    },
  );

  typed.get(
    '/scenarios/:id/series-preview',
    {
      schema: {
        summary: 'Quantas séries a combinação produz e quanto deve demorar',
        description:
          'FR-034a, FR-034d — o custo é dirigido pelo número de SÉRIES, não pelo de linhas. O usuário vê isso antes de disparar.',
        params: ScenarioIdParam,
        querystring: SeriesPreviewQuery,
        response: { 200: SeriesPreviewResponse },
      },
    },
    async (request) => {
      const user = await requireUser(request);
      await service.requireAccess(request.params.id, user.id);
      const levelIds = request.query.levelIds
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      return service.seriesPreview(request.params.id, levelIds, request.query.package);
    },
  );

  typed.get(
    '/model-packages',
    {
      schema: {
        summary: 'Pacotes de modelos disponíveis para o cálculo',
        description:
          'FR-034c — cada pacote define, junto, os modelos candidatos e a profundidade do backtest, com a contrapartida análise × tempo.',
        response: { 200: ModelPackagesResponse },
      },
    },
    async () => ({ data: service.packages() }),
  );
}
