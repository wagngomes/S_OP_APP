import { z } from 'zod';
import { DecimalString, DecimalStringOut } from '../decimal/decimal-string.js';
import { Paginated } from './common.js';

/**
 * Contratos HTTP da fase de consenso e publicação (US4).
 *
 * FR-067 a FR-077.
 */

// --- Tolerância --------------------------------------------------------------

export const ToleranceBody = z.object({
  value: DecimalString(),
  kind: z.enum(['ABSOLUTE', 'PERCENT']),
});
export type ToleranceBody = z.infer<typeof ToleranceBody>;

// --- Decisão de item ---------------------------------------------------------

export const ConsensusDecisionBody = z.object({
  forecastItemId: z.uuid(),
  source: z.enum(['CALCULATED', 'COLLABORATED', 'MANUAL']),
  quantity: DecimalString(),
  reason: z.string().optional(),
});
export type ConsensusDecisionBody = z.infer<typeof ConsensusDecisionBody>;

export const ConsensusDecisionRecord = z.object({
  id: z.uuid(),
  forecastItemId: z.uuid(),
  decidedById: z.string(),
  source: z.enum(['CALCULATED', 'COLLABORATED', 'MANUAL']),
  quantity: DecimalStringOut(),
  reason: z.string().nullable(),
  decidedAt: z.iso.datetime(),
});
export type ConsensusDecisionRecord = z.infer<typeof ConsensusDecisionRecord>;

// --- Item de consenso (calculado × colaborado × decidido) --------------------

export const DivergenceInfo = z.object({
  signed: DecimalStringOut(),
  absolute: DecimalStringOut(),
  percent: DecimalStringOut().nullable(),
});

export const ConsensusItemRow = z.object({
  id: z.uuid(),
  productCode: z.string(),
  segments: z.array(z.string()),
  year: z.int(),
  month: z.int(),
  calculatedQuantity: DecimalStringOut(),
  collaboratedQuantity: DecimalStringOut().nullable(),
  currentDecision: ConsensusDecisionRecord.nullable(),
  divergence: DivergenceInfo,
  withinTolerance: z.boolean(),
});
export type ConsensusItemRow = z.infer<typeof ConsensusItemRow>;

export const ConsensusItemsResponse = Paginated(ConsensusItemRow);

// --- Previsão publicada -------------------------------------------------------

export const PublishedForecastRow = z.object({
  id: z.uuid(),
  forecastItemId: z.uuid(),
  productCode: z.string(),
  segments: z.array(z.string()),
  year: z.int(),
  month: z.int(),
  quantity: DecimalStringOut(),
  publishedAt: z.iso.datetime(),
});
export type PublishedForecastRow = z.infer<typeof PublishedForecastRow>;

export const PublishedForecastResponse = Paginated(PublishedForecastRow);
