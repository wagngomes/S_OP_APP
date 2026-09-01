import { z } from 'zod';

/**
 * Schemas HTTP comuns a toda a superfície `/api/v1`.
 *
 * Ver: specs/001-sop-cycle-forecasting/contracts/http-api-v1.md
 */

/** Paginação offset-based, padrão 100, teto 500. */
export const DEFAULT_PAGE_LIMIT = 100;
export const MAX_PAGE_LIMIT = 500;

export const PaginationQuery = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_LIMIT).default(DEFAULT_PAGE_LIMIT),
  offset: z.coerce.number().int().min(0).default(0),
});
export type PaginationQuery = z.infer<typeof PaginationQuery>;

/** Envelope de resposta paginada. */
export function Paginated<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    data: z.array(item),
    total: z.number().int().min(0),
    limit: z.number().int().min(1),
    offset: z.number().int().min(0),
  });
}

/**
 * Formato único de erro.
 *
 * `code` é estável e é o que o cliente deve testar; `message` é para humanos e
 * pode mudar sem quebrar ninguém.
 */
export const ErrorCode = z.enum([
  'VALIDATION_FAILED',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'PHASE_NOT_ALLOWED',
  'APPROVER_REQUIRED',
  'JOB_ALREADY_ACTIVE',
  'JOB_NOT_COMPLETED',
  'ITEM_CHANGED',
  'REASON_REQUIRED',
  'DECISION_PENDING',
  'PUBLISHED_IMMUTABLE',
  'RATE_LIMITED',
  'UPLOAD_REJECTED',
  'INTERNAL',
]);
export type ErrorCode = z.infer<typeof ErrorCode>;

export const ErrorResponse = z.object({
  error: z.object({
    code: ErrorCode,
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ErrorResponse = z.infer<typeof ErrorResponse>;

/** Resposta de aceite de trabalho assíncrono — o 202 do upload e do cálculo. */
export const AcceptedJob = z.object({
  jobId: z.string().uuid(),
  status: z.literal('PENDING'),
});
export type AcceptedJob = z.infer<typeof AcceptedJob>;

/** Ciclo de vida interno de um job, distinto das fases do cenário. */
export const JobStatus = z.enum(['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED']);
export type JobStatus = z.infer<typeof JobStatus>;

/** Fases do cenário, na ordem do ciclo. */
export const ScenarioPhase = z.enum([
  'TEAM_SETUP',
  'IMPORT_SETUP',
  'CALCULATION',
  'APPROVAL',
  'COLLABORATION',
  'CONSENSUS',
  'PUBLICATION',
  'ACCURACY',
]);
export type ScenarioPhase = z.infer<typeof ScenarioPhase>;
