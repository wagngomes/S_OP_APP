import {
  isActionAllowed,
  validateParameters,
  type ModelPackage,
  type ScenarioAction,
  type ScenarioPhase,
} from '@sop/domain';
import { AppError } from '../middleware/error-handler.js';
import type {
  ParametersRecord,
  ScenarioRecord,
  ScenarioRepository,
  SegmentationLevelRecord,
} from '../composition/ports.js';

/**
 * Casos de uso de cenário e parametrização.
 *
 * O service ORQUESTRA: coordena repositório e domínio, controla o fluxo do caso
 * de uso e traduz a resposta do domínio em erro de transporte. A regra em si vive
 * em `@sop/domain` (Princípio I) — aqui não há decisão de negócio própria.
 */

/** Modelos e janelas por pacote — espelha o catálogo do motor (D1). */
const PACKAGE_INFO: Record<
  ModelPackage,
  { label: string; models: string[]; windows: number; tradeoff: string }
> = {
  FAST: {
    label: 'Rápido',
    models: ['Naive', 'SeasonalNaive', 'HistoricAverage', 'WindowAverage'],
    windows: 1,
    tradeoff: 'Triagem rápida. Indicado quando a combinação de níveis gera muitas séries.',
  },
  STANDARD: {
    label: 'Standard',
    models: [
      'Naive',
      'SeasonalNaive',
      'HistoricAverage',
      'WindowAverage',
      'AutoETS',
      'AutoTheta',
      'CrostonOptimized',
    ],
    windows: 3,
    tradeoff: 'Equilíbrio entre profundidade e tempo. Cobre sazonalidade e demanda intermitente.',
  },
  COMPLETE: {
    label: 'Completo',
    models: [
      'Naive',
      'SeasonalNaive',
      'HistoricAverage',
      'WindowAverage',
      'AutoETS',
      'AutoTheta',
      'CrostonOptimized',
      'AutoARIMA',
    ],
    windows: 4,
    tradeoff:
      'Análise mais profunda, com AutoARIMA. Bem mais lento — reserve para cenários com poucas séries.',
  },
};

/**
 * Custo médio de um ajuste, em segundos.
 *
 * Constante de calibração (D1a): a estimativa não precisa ser precisa, precisa
 * ser honesta na ordem de grandeza. T190 prevê recalibrá-la por medição.
 */
const SECONDS_PER_FIT = 0.02;

export class ScenarioService {
  constructor(private readonly repo: ScenarioRepository) {}

  async create(input: {
    name: string;
    userId: string;
    finalSayRole: 'CREATOR' | 'APPROVER';
    forecastHorizonMonths: number;
  }): Promise<ScenarioRecord> {
    return this.repo.create({
      name: input.name,
      createdById: input.userId,
      finalSayRole: input.finalSayRole,
      forecastHorizonMonths: input.forecastHorizonMonths,
    });
  }

  async list(userId: string, page: { limit: number; offset: number }) {
    return this.repo.listForUser(userId, page);
  }

  /** FR-005 — carrega o cenário garantindo que o usuário participa dele. */
  async requireAccess(scenarioId: string, userId: string): Promise<ScenarioRecord> {
    const scenario = await this.repo.findById(scenarioId);
    if (!scenario) {
      throw new AppError(404, 'NOT_FOUND', 'cenário não encontrado');
    }
    if (!(await this.repo.isMember(scenarioId, userId))) {
      // 404 em vez de 403: revelar que o cenário existe já é vazamento.
      throw new AppError(404, 'NOT_FOUND', 'cenário não encontrado');
    }
    return scenario;
  }

  /** FR-097 — o que o usuário pode fazer na fase atual. */
  availableActions(phase: ScenarioPhase): ScenarioAction[] {
    const all: ScenarioAction[] = [
      'INVITE_MEMBER',
      'CLOSE_TEAM',
      'IMPORT_HISTORY',
      'SET_PARAMETERS',
      'RUN_FORECAST',
      'APPROVE',
      'ADJUST_FORECAST',
      'DECIDE_CONSENSUS',
      'PUBLISH',
      'UPLOAD_ACTUALS',
    ];
    return all.filter((action) => isActionAllowed(phase, action));
  }

  async levels(scenarioId: string): Promise<SegmentationLevelRecord[]> {
    return this.repo.listLevels(scenarioId);
  }

  /**
   * Salva a parametrização depois de validá-la no domínio (FR-032 a FR-036a).
   *
   * A ação só é possível na fase de importação/parametrização (FR-016).
   */
  async saveParameters(
    scenario: ScenarioRecord,
    input: ParametersRecord,
  ): Promise<{ prorationRequired: boolean; zeroHeavyWarning: boolean }> {
    if (!isActionAllowed(scenario.phase, 'SET_PARAMETERS')) {
      throw new AppError(
        409,
        'PHASE_NOT_ALLOWED',
        `a parametrização não pode ser alterada na fase ${scenario.phase}`,
      );
    }

    const [levels, stats] = await Promise.all([
      this.repo.listLevels(scenario.id),
      this.repo.historyStats(scenario.id),
    ]);

    const validation = validateParameters(
      {
        groupingLevelIds: input.groupingLevelIds,
        prorationMonths: input.prorationMonths,
        accuracyMetric: input.accuracyMetric,
        modelPackage: input.modelPackage,
        horizonMonths: input.horizonMonths,
      },
      {
        levels,
        availableHistoryMonths: stats.availableHistoryMonths,
        zeroMonthProportion: stats.zeroMonthProportion,
      },
    );

    if (validation.issues.length > 0) {
      throw new AppError(
        400,
        'VALIDATION_FAILED',
        'parametrização inválida',
        validation.issues,
      );
    }

    await this.repo.saveParameters(scenario.id, input);

    return {
      prorationRequired: validation.prorationRequired,
      zeroHeavyWarning: validation.zeroHeavyWarning,
    };
  }

  async getParameters(scenarioId: string): Promise<ParametersRecord | null> {
    return this.repo.getParameters(scenarioId);
  }

  packages() {
    return (Object.keys(PACKAGE_INFO) as ModelPackage[]).map((id) => ({
      id,
      label: PACKAGE_INFO[id].label,
      models: PACKAGE_INFO[id].models,
      backtestWindows: PACKAGE_INFO[id].windows,
      tradeoff: PACKAGE_INFO[id].tradeoff,
    }));
  }

  /**
   * Prévia de custo antes do disparo (FR-034a, FR-034d, D1a).
   *
   * É contagem, não estatística — por isso fica na API e não no motor.
   */
  async seriesPreview(scenarioId: string, levelIds: string[], pkg: ModelPackage) {
    const info = PACKAGE_INFO[pkg];
    const seriesCount = await this.repo.countDistinctSeries(scenarioId, levelIds);
    const seconds = Math.ceil(
      seriesCount * info.models.length * info.windows * SECONDS_PER_FIT,
    );

    return {
      seriesCount,
      estimatedDurationSeconds: seconds,
      magnitude: magnitudeOf(seconds),
      modelsEvaluated: info.models.length,
      backtestWindows: info.windows,
    };
  }
}

/** Ordem de grandeza legível — o que separa "dois minutos" de "duas horas". */
function magnitudeOf(seconds: number): 'SECONDS' | 'MINUTES' | 'TENS_OF_MINUTES' | 'HOURS' {
  if (seconds < 60) return 'SECONDS';
  if (seconds < 600) return 'MINUTES';
  if (seconds < 3600) return 'TENS_OF_MINUTES';
  return 'HOURS';
}
