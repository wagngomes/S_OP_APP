import { z } from 'zod';
import { DecimalString } from '../decimal/decimal-string.js';
import { AccuracyMetric, ModelPackage } from './scenarios.js';
import { Paginated } from './common.js';

/**
 * Contratos HTTP do ciclo de cálculo de previsão.
 *
 * Grandezas (quantidade, métrica de erro) trafegam como DecimalString
 * — nunca como número JSON (Princípio V).
 */

// --- Disparo -----------------------------------------------------------------

export const ForecastJobAccepted = z.object({
  jobId: z.uuid(),
});

// --- Status do job -----------------------------------------------------------

export const ForecastJobStatusSchema = z.object({
  id: z.uuid(),
  scenarioId: z.uuid(),
  status: z.enum(['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED']),
  horizonMonths: z.int().min(1),
  accuracyMetric: AccuracyMetric,
  modelPackage: ModelPackage,
  createdAt: z.iso.datetime(),
  startedAt: z.iso.datetime().nullable(),
  finishedAt: z.iso.datetime().nullable(),
  failureReason: z.string().nullable(),
});

// --- Itens de previsão -------------------------------------------------------

export const ForecastItemRow = z.object({
  id: z.uuid(),
  productCode: z.string(),
  /** Valores de cada segmento na mesma ordem dos níveis (FR-046). */
  segments: z.array(z.string()),
  year: z.int(),
  month: z.int().min(1).max(12),
  /** String decimal — nunca número JSON (Princípio V). */
  quantity: DecimalString(),
  /** Modelo vencedor para a série a que este item pertence. */
  winnerModel: z.string(),
  /** Erro do modelo vencedor no backtest (DecimalString, pode ser null). */
  metricValue: DecimalString().nullable(),
});

export const ForecastItemsResponse = Paginated(ForecastItemRow);

// --- Séries (agregado de previsão) -------------------------------------------

export const ForecastSeriesRow = z.object({
  id: z.uuid(),
  /** Valores dos rótulos de agrupamento, na ordem da parametrização. */
  segments: z.array(z.string()),
  winnerModel: z.string(),
  metricValue: DecimalString().nullable(),
  excludedModels: z.array(z.string()),
});

export const ForecastSeriesResponse = Paginated(ForecastSeriesRow);
