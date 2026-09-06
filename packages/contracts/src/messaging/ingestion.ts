import { z } from 'zod';
import { ObjectUri } from './envelope.js';

/**
 * Schema de payload de `ingestion.request`.
 *
 * Ver: specs/001-sop-cycle-forecasting/contracts/messaging.md
 */

const uuid = z.string().uuid();

export const IngestionKind = z.enum(['SALES_HISTORY', 'COLLABORATION_SHEET', 'ACTUAL_SALES']);
export type IngestionKind = z.infer<typeof IngestionKind>;

export const IngestionRequestPayload = z.object({
  jobId: uuid,
  scenarioId: uuid,
  kind: IngestionKind,
  objectUri: ObjectUri,
  declaredLabels: z.array(z.string()).min(1),
  uploadedById: uuid,
});
export type IngestionRequestPayload = z.infer<typeof IngestionRequestPayload>;
