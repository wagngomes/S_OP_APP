import { z } from 'zod';
import { DecimalString } from '../decimal/decimal-string.js';
import { Paginated } from './common.js';

/**
 * Contratos HTTP da fase de colaboração (US3).
 *
 * FR-057 a FR-066.
 */

// --- Ajuste de item ----------------------------------------------------------

export const AdjustmentBody = z.object({
  forecastItemId: z.uuid(),
  /** Quantidade proposta — string decimal (Princípio V). */
  quantity: DecimalString(),
  /** Motivo obrigatório (FR-058). */
  reason: z.string().min(5),
  /** Versão que o cliente estava vendo; ausente aceita o risco de sobrescrever. */
  expectedVersion: z.int().optional(),
});
export type AdjustmentBody = z.infer<typeof AdjustmentBody>;

export const AdjustmentRecord = z.object({
  id: z.uuid(),
  forecastItemId: z.uuid(),
  authorId: z.string(),
  quantity: DecimalString(),
  reason: z.string(),
  origin: z.enum(['UI', 'SPREADSHEET']),
  createdAt: z.iso.datetime(),
});
export type AdjustmentRecord = z.infer<typeof AdjustmentRecord>;

// --- Item de colaboração (calculado × colaborado) ----------------------------

export const CollaborationItemRow = z.object({
  id: z.uuid(),
  productCode: z.string(),
  segments: z.array(z.string()),
  year: z.int(),
  month: z.int(),
  /** Previsão calculada pelo motor — imutável (Princípio II). */
  calculatedQuantity: DecimalString(),
  /** Ajuste vigente, se houver; null = sem alteração. */
  currentAdjustment: AdjustmentRecord.nullable(),
  /** Número total de ajustes para detecção de edição concorrente (FR-066b). */
  version: z.int().min(0),
});
export type CollaborationItemRow = z.infer<typeof CollaborationItemRow>;

export const CollaborationItemsResponse = Paginated(CollaborationItemRow);

// --- Planilha ----------------------------------------------------------------

export const SheetResponse = z.object({
  url: z.string(),
  expiresAt: z.iso.datetime(),
});
export type SheetResponse = z.infer<typeof SheetResponse>;
