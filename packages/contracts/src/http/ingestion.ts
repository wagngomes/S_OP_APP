import { z } from 'zod';
import { IngestionKind } from '../messaging/ingestion.js';
import { JobStatus, Paginated } from './common.js';

/**
 * Schemas HTTP de ingestão de arquivos.
 *
 * Ver: specs/001-sop-cycle-forecasting/contracts/http-api-v1.md — Ingestão
 */

/** Resposta 202 do upload multipart — jobId para polling de status. */
export const UploadAcceptedResponse = z.object({
  jobId: z.string().uuid(),
});
export type UploadAcceptedResponse = z.infer<typeof UploadAcceptedResponse>;

/** Status e contadores de um job de ingestão (FR-027). */
export const IngestionJobStatus = z.object({
  id: z.string().uuid(),
  kind: IngestionKind,
  status: JobStatus,
  totalRows: z.int().min(0),
  validRows: z.int().min(0),
  invalidRows: z.int().min(0),
  issueCount: z.int().min(0),
  issueCapReached: z.boolean(),
  createdAt: z.iso.datetime(),
  startedAt: z.iso.datetime().nullable(),
  finishedAt: z.iso.datetime().nullable(),
  failureReason: z.string().nullable(),
});
export type IngestionJobStatus = z.infer<typeof IngestionJobStatus>;

/** Uma linha inválida reportada pelo worker (FR-024). */
export const IngestionIssueItem = z.object({
  id: z.string().uuid(),
  lineNumber: z.int().min(1),
  column: z.string().nullable(),
  code: z.string(),
  detail: z.string(),
});
export type IngestionIssueItem = z.infer<typeof IngestionIssueItem>;

export const IngestionIssuesResponse = Paginated(IngestionIssueItem);
export type IngestionIssuesResponse = z.infer<typeof IngestionIssuesResponse>;
