import { ApprovalDecisionBody, ScenarioIdParam } from '@sop/contracts';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type {
  Authenticator,
  MembershipRepository,
  NotificationPort,
  ScenarioRepository,
} from '../../composition/ports.js';
import { AppError } from '../../middleware/error-handler.js';
import { NotificationService } from '../../services/notification.service.js';
import { ApprovalService } from '../../services/approval.service.js';

export function registerApprovalRoutes(
  app: FastifyInstance,
  deps: {
    auth: Authenticator;
    scenarios: ScenarioRepository;
    membership: MembershipRepository;
    notification?: NotificationPort;
  },
): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const approvalService = new ApprovalService(deps.scenarios, deps.membership);
  const notificationSvc = deps.notification
    ? new NotificationService(deps.notification, app.log)
    : null;

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

      // FR-096 — notificação em transação separada: falha não desfaz a transição
      if (notificationSvc && request.body.decision === 'APPROVE') {
        const [scenario, members] = await Promise.all([
          deps.scenarios.findById(request.params.id),
          deps.membership.listMembers(request.params.id),
        ]);
        const collaboratorEmails = members
          .filter((m) => m.role === 'COLLABORATOR')
          .map((m) => m.invitedEmail);
        await notificationSvc.safeNotifyPhaseAdvanced({
          scenarioId: request.params.id,
          scenarioName: scenario?.name ?? '',
          phase: 'COLLABORATION',
          recipientEmails: collaboratorEmails,
          correlationId: request.id,
        });
      }

      return reply.status(204).send();
    },
  );
}
