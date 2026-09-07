import { ApprovalDecisionBody, ScenarioIdParam } from '@sop/contracts';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Authenticator, MembershipRepository, ScenarioRepository } from '../../composition/ports.js';
import { AppError } from '../../middleware/error-handler.js';
import { ApprovalService } from '../../services/approval.service.js';

export function registerApprovalRoutes(
  app: FastifyInstance,
  deps: {
    auth: Authenticator;
    scenarios: ScenarioRepository;
    membership: MembershipRepository;
  },
): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const approvalService = new ApprovalService(deps.scenarios, deps.membership);

  typed.post(
    '/scenarios/:id/approval-decision',
    {
      schema: {
        tags: ['Aprovação'],
        summary: 'APPROVE ou RETURN da previsão (FR-055, FR-056)',
        params: ScenarioIdParam,
        body: ApprovalDecisionBody,
        response: { 204: z.undefined() },
      },
    },
    async (request, reply) => {
      const user = await deps.auth.currentUser(request.headers as Record<string, string | string[] | undefined>);
      if (!user) throw new AppError(401, 'UNAUTHORIZED', 'não autenticado');

      await approvalService.decide(request.params.id, user.id, {
        decision: request.body.decision,
        ...(request.body.reason !== undefined ? { reason: request.body.reason } : {}),
      });
      return reply.status(204).send();
    },
  );
}
