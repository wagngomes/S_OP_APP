import {
  IngestionIssueItem,
  IngestionIssuesResponse,
  IngestionJobStatus,
  PaginationQuery,
} from '@sop/contracts';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Authenticator, IngestionRepository } from '../../composition/ports.js';
import { AppError } from '../../middleware/error-handler.js';

/**
 * Rotas de status e relatório de ingestão (T098).
 *
 * Polling de status: GET /api/v1/ingestion-jobs/:jobId
 * Relatório paginado: GET /api/v1/ingestion-jobs/:jobId/issues (FR-024)
 */
export function registerIngestionRoutes(
  app: FastifyInstance,
  deps: { auth: Authenticator; ingestion: IngestionRepository },
): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  async function requireUser(request: FastifyRequest): Promise<{ id: string }> {
    const user = await deps.auth.currentUser(request.headers);
    if (!user) throw new AppError(401, 'UNAUTHENTICATED', 'autentique-se para acessar este recurso');
    return user;
  }

  const JobIdParam = z.object({ jobId: z.string().uuid() });

  typed.get(
    '/ingestion-jobs/:jobId',
    {
      schema: {
        summary: 'Status e contadores do job de ingestão',
        description: 'FR-027 — polling até status COMPLETED ou FAILED.',
        params: JobIdParam,
        response: { 200: IngestionJobStatus },
      },
    },
    async (request) => {
      await requireUser(request);
      const job = await deps.ingestion.findById(request.params.jobId);
      if (!job) throw new AppError(404, 'NOT_FOUND', 'job de ingestão não encontrado');
      return {
        id: job.id,
        kind: job.kind,
        status: job.status,
        totalRows: job.totalRows,
        validRows: job.validRows,
        invalidRows: job.invalidRows,
        issueCount: job.issueCount,
        issueCapReached: job.issueCapReached,
        createdAt: job.createdAt,
        startedAt: job.startedAt,
        finishedAt: job.finishedAt,
        failureReason: job.failureReason,
      };
    },
  );

  typed.get(
    '/ingestion-jobs/:jobId/issues',
    {
      schema: {
        summary: 'Relatório paginado de linhas inválidas',
        description: 'FR-024 — o worker acumula problemas sem abortar na primeira linha ruim.',
        params: JobIdParam,
        querystring: PaginationQuery,
        response: { 200: IngestionIssuesResponse },
      },
    },
    async (request) => {
      await requireUser(request);
      const job = await deps.ingestion.findById(request.params.jobId);
      if (!job) throw new AppError(404, 'NOT_FOUND', 'job de ingestão não encontrado');
      const { limit, offset } = request.query;
      const page = await deps.ingestion.listIssues(job.id, { limit, offset });
      return { data: page.data, total: page.total, limit, offset };
    },
  );
}
