import { z } from 'zod';
import { ObjectUri } from './envelope.js';
import { AccuracyMetric, ModelPackage } from '../http/scenarios.js';

/**
 * Schemas de payload de `forecast.request` e `forecast.result`.
 *
 * O motor recebe rótulos, não ids do banco — ele não conhece o schema Prisma
 * (Princípio III). Campos numéricos aqui são cardinalidades (meses, contagens),
 * nunca grandezas monetárias, portanto z.int() é correto (Princípio V).
 *
 * Ver: specs/001-sop-cycle-forecasting/contracts/messaging.md
 */

const uuid = z.string().uuid();

export const ForecastRequestParams = z.object({
  groupingLabels: z.array(z.string()).min(1),
  granularLabels: z.array(z.string()).min(1),
  prorationMonths: z.int().min(1),
  horizonMonths: z.int().min(1),
  accuracyMetric: AccuracyMetric,
  modelPackage: ModelPackage,
  decimalScale: z.int().min(1).max(10),
  nonNegativeForecast: z.boolean(),
});
export type ForecastRequestParams = z.infer<typeof ForecastRequestParams>;

export const ForecastRequestPayload = z.object({
  jobId: uuid,
  scenarioId: uuid,
  inputUri: ObjectUri,
  outputPrefix: ObjectUri,
  modelCatalogVersion: z.string().min(1),
  params: ForecastRequestParams,
});
export type ForecastRequestPayload = z.infer<typeof ForecastRequestPayload>;

const ForecastStats = z.object({
  seriesCount: z.int().min(0),
  itemCount: z.int().min(0),
  durationMs: z.int().min(0),
});

const ForecastFailure = z.object({
  code: z.string().min(1),
  message: z.string(),
});

const ForecastResultCompleted = z.object({
  jobId: uuid,
  status: z.literal('completed'),
  outputUri: ObjectUri,
  seriesUri: ObjectUri,
  modelCatalogVersion: z.string().min(1),
  stats: ForecastStats,
  failure: z.null(),
});

const ForecastResultFailed = z.object({
  jobId: uuid,
  status: z.literal('failed'),
  outputUri: z.null(),
  seriesUri: z.null(),
  modelCatalogVersion: z.string().min(1),
  stats: z.null(),
  failure: ForecastFailure,
});

export const ForecastResultPayload = z.discriminatedUnion('status', [
  ForecastResultCompleted,
  ForecastResultFailed,
]);
export type ForecastResultPayload = z.infer<typeof ForecastResultPayload>;
