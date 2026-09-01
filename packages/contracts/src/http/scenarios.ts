import { z } from 'zod';
import { ScenarioPhase } from './common.js';

/**
 * Superfície de cenário e parametrização da v1.
 *
 * Fonte única: a OpenAPI e a validação em runtime derivam daqui (D9).
 *
 * Nenhum campo destes schemas usa `z.number()` para grandeza de negócio — os
 * únicos números presentes são contagens e meses, que são cardinalidades, não
 * quantidades (Princípio V).
 */

export const AccuracyMetric = z.enum(['WMAPE', 'MAPE', 'BIAS']);
export type AccuracyMetric = z.infer<typeof AccuracyMetric>;

export const ModelPackage = z.enum(['FAST', 'STANDARD', 'COMPLETE']);
export type ModelPackage = z.infer<typeof ModelPackage>;

export const FinalSayRole = z.enum(['CREATOR', 'APPROVER']);

// --- Cenário ----------------------------------------------------------------

export const CreateScenarioBody = z.object({
  name: z.string().min(1).max(200),
  finalSayRole: FinalSayRole.default('CREATOR'),
  forecastHorizonMonths: z.int().min(1).max(120).default(12),
});
export type CreateScenarioBody = z.infer<typeof CreateScenarioBody>;

export const ScenarioSummary = z.object({
  id: z.uuid(),
  name: z.string(),
  phase: ScenarioPhase,
  finalSayRole: FinalSayRole,
  teamClosed: z.boolean(),
  published: z.boolean(),
  createdAt: z.iso.datetime(),
});
export type ScenarioSummary = z.infer<typeof ScenarioSummary>;

export const ScenarioDetail = ScenarioSummary.extend({
  forecastHorizonMonths: z.int(),
  /** Ações possíveis na fase atual — o frontend bloqueia o resto (FR-097). */
  availableActions: z.array(z.string()),
});

export const ScenarioIdParam = z.object({ id: z.uuid() });

// --- Níveis de segmentação --------------------------------------------------

export const SegmentationLevel = z.object({
  id: z.uuid(),
  position: z.int().min(0),
  label: z.string(),
});

export const LevelsResponse = z.object({ data: z.array(SegmentationLevel) });

// --- Parametrização ---------------------------------------------------------

export const ParametersBody = z.object({
  /** Combinação de níveis — um ou mais (FR-032). */
  groupingLevelIds: z.array(z.uuid()),
  prorationMonths: z.int(),
  accuracyMetric: AccuracyMetric,
  modelPackage: ModelPackage,
  horizonMonths: z.int().default(12),
});
export type ParametersBody = z.infer<typeof ParametersBody>;

export const ParametersResponse = ParametersBody.extend({
  /** FR-032d — falso quando a combinação já é a granularidade original. */
  prorationRequired: z.boolean(),
  /** FR-036a — MAPE em cenário com muitos meses zerados. */
  zeroHeavyWarning: z.boolean(),
});

// --- Pacotes de modelos -----------------------------------------------------

export const ModelPackageInfo = z.object({
  id: ModelPackage,
  label: z.string(),
  models: z.array(z.string()),
  backtestWindows: z.int(),
  /** A contrapartida análise × tempo, para a escolha ser informada (FR-034c). */
  tradeoff: z.string(),
});

export const ModelPackagesResponse = z.object({ data: z.array(ModelPackageInfo) });

// --- Prévia de custo --------------------------------------------------------

export const SeriesPreviewQuery = z.object({
  /** Ids de nível separados por vírgula; vazio significa visão Cia. */
  levelIds: z.string().default(''),
  package: ModelPackage.default('STANDARD'),
});

export const SeriesPreviewResponse = z.object({
  /** FR-034a — é o número de séries, não o de linhas, que dirige o custo. */
  seriesCount: z.int().min(0),
  estimatedDurationSeconds: z.int().min(0),
  /** Ordem de grandeza legível: o que separa "dois minutos" de "duas horas". */
  magnitude: z.enum(['SECONDS', 'MINUTES', 'TENS_OF_MINUTES', 'HOURS']),
  modelsEvaluated: z.int(),
  backtestWindows: z.int(),
});
export type SeriesPreviewResponse = z.infer<typeof SeriesPreviewResponse>;
