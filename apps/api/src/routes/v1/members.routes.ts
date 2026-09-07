import { InviteMemberBody, MembersResponse, ScenarioIdParam, ScenarioMember } from '@sop/contracts';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Authenticator, MembershipRepository, ScenarioRepository } from '../../composition/ports.js';
import { AppError } from '../../middleware/error-handler.js';
import { MembershipService } from '../../services/membership.service.js';
import { TeamService } from '../../services/team.service.js';

export function registerMemberRoutes(
  app: FastifyInstance,
  deps: {
    auth: Authenticator;
    scenarios: ScenarioRepository;
    membership: MembershipRepository;
  },
): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const membershipService = new MembershipService(deps.scenarios, deps.membership);
  const teamService = new TeamService(deps.scenarios, deps.membership);

  typed.post(
    '/scenarios/:id/members',
    {
      schema: {
        tags: ['Membros'],
        summary: 'Convida um membro para o cenário (FR-009)',
        params: ScenarioIdParam,
        body: InviteMemberBody,
        response: { 201: ScenarioMember },
      },
    },
    async (request, reply) => {
      const user = await deps.auth.currentUser(request.headers as Record<string, string | string[] | undefined>);
      if (!user) throw new AppError(401, 'UNAUTHORIZED', 'não autenticado');

      const member = await membershipService.invite(request.params.id, user.id, request.body);
      return reply.status(201).send(member);
    },
  );

  typed.get(
    '/scenarios/:id/members',
    {
      schema: {
        tags: ['Membros'],
        summary: 'Lista membros do cenário',
        params: ScenarioIdParam,
        response: { 200: MembersResponse },
      },
    },
    async (request, reply) => {
      const user = await deps.auth.currentUser(request.headers as Record<string, string | string[] | undefined>);
      if (!user) throw new AppError(401, 'UNAUTHORIZED', 'não autenticado');

      const data = await membershipService.listMembers(request.params.id, user.id);
      return reply.status(200).send({ data });
    },
  );

  typed.post(
    '/scenarios/:id/close-team',
    {
      schema: {
        tags: ['Membros'],
        summary: 'Fecha a equipe (FR-013-015)',
        params: ScenarioIdParam,
        response: { 204: z.undefined() },
      },
    },
    async (request, reply) => {
      const user = await deps.auth.currentUser(request.headers as Record<string, string | string[] | undefined>);
      if (!user) throw new AppError(401, 'UNAUTHORIZED', 'não autenticado');

      await teamService.closeTeam(request.params.id, user.id);
      return reply.status(204).send();
    },
  );
}
