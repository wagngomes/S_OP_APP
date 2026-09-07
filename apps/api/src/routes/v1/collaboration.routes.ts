import {
  AdjustmentBody,
  AdjustmentRecord,
  CollaborationItemsResponse,
  PaginationQuery,
  ScenarioIdParam,
  SheetResponse,
} from '@sop/contracts';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type {
  Authenticator,
  CollaborationRepository,
  DatasetStore,
  MembershipRepository,
  ScenarioRepository,
} from '../../composition/ports.js';
import { AppError } from '../../middleware/error-handler.js';
import { CollaborationService } from '../../services/collaboration.service.js';
import { CollaborationSheetService } from '../../services/collaboration-sheet.service.js';

export function registerCollaborationRoutes(
  app: FastifyInstance,
  deps: {
    auth: Authenticator;
    scenarios: ScenarioRepository;
    membership: MembershipRepository;
    collaboration: CollaborationRepository;
    datasets: DatasetStore;
  },
): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const service = new CollaborationService(deps.scenarios, deps.membership, deps.collaboration);
  const sheetService = new CollaborationSheetService(deps.scenarios, deps.collaboration, deps.datasets);

  typed.post(
    '/scenarios/:id/collaboration/adjustments',
    {
      schema: {
        tags: ['Colaboração'],
        summary: 'Registra ou atualiza o ajuste de um item de previsão (FR-061)',
        params: ScenarioIdParam,
        body: AdjustmentBody,
        response: { 200: AdjustmentRecord },
      },
    },
    async (request) => {
      const user = await deps.auth.currentUser(request.headers as Record<string, string | string[] | undefined>);
      if (!user) throw new AppError(401, 'UNAUTHORIZED', 'não autenticado');
      const { forecastItemId, quantity, reason, expectedVersion } = request.body;
      return service.adjust(request.params.id, user.id, {
        forecastItemId,
        quantity,
        reason,
        ...(expectedVersion !== undefined ? { expectedVersion } : {}),
      });
    },
  );

  typed.get(
    '/scenarios/:id/collaboration/items',
    {
      schema: {
        tags: ['Colaboração'],
        summary: 'Lista itens de previsão com ajuste atual (FR-060)',
        params: ScenarioIdParam,
        querystring: PaginationQuery,
        response: { 200: CollaborationItemsResponse },
      },
    },
    async (request) => {
      const user = await deps.auth.currentUser(request.headers as Record<string, string | string[] | undefined>);
      if (!user) throw new AppError(401, 'UNAUTHORIZED', 'não autenticado');
      const { limit, offset } = request.query;
      const result = await service.listItems(request.params.id, user.id, { limit, offset });
      return { ...result, limit, offset };
    },
  );

  typed.post(
    '/scenarios/:id/collaboration/done',
    {
      schema: {
        tags: ['Colaboração'],
        summary: 'Colaborador sinaliza conclusão (FR-063, FR-064)',
        params: ScenarioIdParam,
        response: { 204: z.undefined() },
      },
    },
    async (request, reply) => {
      const user = await deps.auth.currentUser(request.headers as Record<string, string | string[] | undefined>);
      if (!user) throw new AppError(401, 'UNAUTHORIZED', 'não autenticado');
      await service.markDone(request.params.id, user.id);
      return reply.status(204).send();
    },
  );

  typed.post(
    '/scenarios/:id/collaboration/close',
    {
      schema: {
        tags: ['Colaboração'],
        summary: 'Criador encerra colaboração antecipadamente (FR-065)',
        params: ScenarioIdParam,
        response: { 204: z.undefined() },
      },
    },
    async (request, reply) => {
      const user = await deps.auth.currentUser(request.headers as Record<string, string | string[] | undefined>);
      if (!user) throw new AppError(401, 'UNAUTHORIZED', 'não autenticado');
      await service.closeCollaboration(request.params.id, user.id);
      return reply.status(204).send();
    },
  );

  typed.get(
    '/scenarios/:id/collaboration/sheet',
    {
      schema: {
        tags: ['Colaboração'],
        summary: 'Gera planilha CSV e retorna URL assinada (FR-060)',
        params: ScenarioIdParam,
        response: { 200: SheetResponse },
      },
    },
    async (request) => {
      const user = await deps.auth.currentUser(request.headers as Record<string, string | string[] | undefined>);
      if (!user) throw new AppError(401, 'UNAUTHORIZED', 'não autenticado');
      return sheetService.generateSheet(request.params.id, user.id);
    },
  );
}
