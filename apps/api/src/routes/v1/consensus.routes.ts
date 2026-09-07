import {
  ConsensusDecisionBody,
  ConsensusDecisionRecord,
  ConsensusItemsResponse,
  PaginationQuery,
  PublishedForecastResponse,
  ScenarioIdParam,
  ToleranceBody,
} from '@sop/contracts';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type {
  Authenticator,
  ConsensusRepository,
  MembershipRepository,
  ScenarioRepository,
} from '../../composition/ports.js';
import { AppError } from '../../middleware/error-handler.js';
import { ConsensusService } from '../../services/consensus.service.js';
import { PublicationService } from '../../services/publication.service.js';

export function registerConsensusRoutes(
  app: FastifyInstance,
  deps: {
    auth: Authenticator;
    scenarios: ScenarioRepository;
    membership: MembershipRepository;
    consensus: ConsensusRepository;
  },
): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const service = new ConsensusService(deps.scenarios, deps.membership, deps.consensus);
  const pubService = new PublicationService(deps.scenarios, deps.membership, deps.consensus);

  // PUT /scenarios/:id/consensus/tolerance — define faixa (FR-069)
  typed.put(
    '/scenarios/:id/consensus/tolerance',
    {
      schema: {
        tags: ['Consenso'],
        summary: 'Define a faixa de tolerância para o consenso (FR-069)',
        params: ScenarioIdParam,
        body: ToleranceBody,
        response: { 204: z.undefined() },
      },
    },
    async (request, reply) => {
      const user = await deps.auth.currentUser(request.headers as Record<string, string | string[] | undefined>);
      if (!user) throw new AppError(401, 'UNAUTHORIZED', 'não autenticado');
      await service.setTolerance(request.params.id, user.id, request.body);
      return reply.status(204).send();
    },
  );

  // GET /scenarios/:id/consensus/items — lista com divergência (FR-069)
  typed.get(
    '/scenarios/:id/consensus/items',
    {
      schema: {
        tags: ['Consenso'],
        summary: 'Lista itens com divergência calculada e decisão atual (FR-069)',
        params: ScenarioIdParam,
        querystring: PaginationQuery.extend({ sort: z.enum(['delta_desc', 'default']).optional() }),
        response: { 200: ConsensusItemsResponse },
      },
    },
    async (request) => {
      const user = await deps.auth.currentUser(request.headers as Record<string, string | string[] | undefined>);
      if (!user) throw new AppError(401, 'UNAUTHORIZED', 'não autenticado');
      const { limit, offset, sort } = request.query;
      const result = await service.listItems(
        request.params.id,
        user.id,
        { limit, offset },
        sort === 'delta_desc',
      );
      return { data: result.data, total: result.total, limit, offset };
    },
  );

  // POST /scenarios/:id/consensus/decisions — decide item (FR-070, FR-071, FR-072)
  typed.post(
    '/scenarios/:id/consensus/decisions',
    {
      schema: {
        tags: ['Consenso'],
        summary: 'Registra decisão para um item de previsão (FR-070, FR-072)',
        params: ScenarioIdParam,
        body: ConsensusDecisionBody,
        response: { 200: ConsensusDecisionRecord },
      },
    },
    async (request) => {
      const user = await deps.auth.currentUser(request.headers as Record<string, string | string[] | undefined>);
      if (!user) throw new AppError(401, 'UNAUTHORIZED', 'não autenticado');
      const { forecastItemId, source, quantity, reason } = request.body;
      return service.decide(request.params.id, user.id, {
        forecastItemId,
        source,
        quantity,
        ...(reason !== undefined ? { reason } : {}),
      });
    },
  );

  // POST /scenarios/:id/publication — publica (FR-073, FR-074, FR-075)
  typed.post(
    '/scenarios/:id/publication',
    {
      schema: {
        tags: ['Consenso'],
        summary: 'Publica a previsão consensada (FR-073, FR-074, FR-075)',
        params: ScenarioIdParam,
        response: { 204: z.undefined() },
      },
    },
    async (request, reply) => {
      const user = await deps.auth.currentUser(request.headers as Record<string, string | string[] | undefined>);
      if (!user) throw new AppError(401, 'UNAUTHORIZED', 'não autenticado');
      await pubService.publish(request.params.id, user.id);
      return reply.status(204).send();
    },
  );

  // GET /scenarios/:id/published-forecast — leitura somente (FR-076, FR-077)
  typed.get(
    '/scenarios/:id/published-forecast',
    {
      schema: {
        tags: ['Consenso'],
        summary: 'Lê a previsão publicada, somente leitura (FR-076, FR-077)',
        params: ScenarioIdParam,
        querystring: PaginationQuery,
        response: { 200: PublishedForecastResponse },
      },
    },
    async (request) => {
      const user = await deps.auth.currentUser(request.headers as Record<string, string | string[] | undefined>);
      if (!user) throw new AppError(401, 'UNAUTHORIZED', 'não autenticado');
      if (!(await deps.scenarios.isMember(request.params.id, user.id))) {
        throw new AppError(404, 'NOT_FOUND', 'cenário não encontrado');
      }
      const { limit, offset } = request.query;
      const result = await deps.consensus.listPublished(request.params.id, { limit, offset });
      return { ...result, limit, offset };
    },
  );
}
