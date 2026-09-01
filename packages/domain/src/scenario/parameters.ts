/**
 * Validação da parametrização do cálculo (FR-031 a FR-036a).
 *
 * Função pura: recebe a escolha do usuário e o contexto do cenário, devolve os
 * problemas encontrados. Não consulta banco e não lança — o chamador decide o
 * que fazer com a lista.
 */

export type AccuracyMetric = 'WMAPE' | 'MAPE' | 'BIAS';
export type ModelPackage = 'FAST' | 'STANDARD' | 'COMPLETE';

export type SegmentationLevelRef = {
  id: string;
  position: number;
  label: string;
};

export type ParametersInput = {
  /** Combinação de níveis — um ou mais (FR-032). */
  groupingLevelIds: string[];
  prorationMonths: number;
  accuracyMetric: AccuracyMetric;
  modelPackage: ModelPackage;
  horizonMonths: number;
};

export type ParametersContext = {
  levels: readonly SegmentationLevelRef[];
  availableHistoryMonths: number;
  /** Proporção de meses com realizado zero no cenário, entre 0 e 1. */
  zeroMonthProportion: number;
};

export type ParameterIssue = {
  field: keyof ParametersInput;
  code: 'VALIDATION_FAILED';
  detail: string;
};

export type ParametersValidation = {
  issues: ParameterIssue[];
  /** FR-032d — falso quando a combinação já é a granularidade original. */
  prorationRequired: boolean;
  /** FR-036a — métrica indefinida para parte relevante das séries. */
  zeroHeavyWarning: boolean;
};

/** Acima disto, MAPE passa a ser dirigido por ruído em vez de por sinal. */
const ZERO_HEAVY_THRESHOLD = 0.25;

/** Horizonte máximo aceito: dez anos já é muito além de qualquer ciclo de S&OP. */
const MAX_HORIZON_MONTHS = 120;

export function validateParameters(
  input: ParametersInput,
  context: ParametersContext,
): ParametersValidation {
  const issues: ParameterIssue[] = [];
  const knownIds = new Set(context.levels.map((l) => l.id));

  // --- combinação de níveis -------------------------------------------------
  if (input.groupingLevelIds.length === 0) {
    issues.push({
      field: 'groupingLevelIds',
      code: 'VALIDATION_FAILED',
      detail: 'arraste ao menos um nível para o campo de agrupamento',
    });
  }

  const duplicated = input.groupingLevelIds.filter(
    (id, i) => input.groupingLevelIds.indexOf(id) !== i,
  );
  if (duplicated.length > 0) {
    issues.push({
      field: 'groupingLevelIds',
      code: 'VALIDATION_FAILED',
      detail: 'o mesmo nível não pode ser arrastado mais de uma vez',
    });
  }

  const unknown = input.groupingLevelIds.filter((id) => !knownIds.has(id));
  if (unknown.length > 0) {
    issues.push({
      field: 'groupingLevelIds',
      code: 'VALIDATION_FAILED',
      detail: `nível não pertence a este cenário: ${unknown.join(', ')}`,
    });
  }

  // --- meses de rateio ------------------------------------------------------
  if (!Number.isInteger(input.prorationMonths) || input.prorationMonths < 1) {
    issues.push({
      field: 'prorationMonths',
      code: 'VALIDATION_FAILED',
      detail: 'os meses de histórico para rateio devem ser um inteiro positivo',
    });
  } else if (input.prorationMonths > context.availableHistoryMonths) {
    issues.push({
      field: 'prorationMonths',
      code: 'VALIDATION_FAILED',
      detail:
        `foram pedidos ${input.prorationMonths} meses de histórico para o rateio, ` +
        `mas o cenário tem ${context.availableHistoryMonths}`,
    });
  }

  // --- pacote e métrica -----------------------------------------------------
  if (!input.modelPackage) {
    issues.push({
      field: 'modelPackage',
      code: 'VALIDATION_FAILED',
      detail: 'escolha um pacote de modelos: Rápido, Standard ou Completo',
    });
  }

  if (!input.accuracyMetric) {
    issues.push({
      field: 'accuracyMetric',
      code: 'VALIDATION_FAILED',
      detail: 'a métrica de acurácia é obrigatória antes do cálculo',
    });
  }

  // --- horizonte ------------------------------------------------------------
  if (
    !Number.isInteger(input.horizonMonths) ||
    input.horizonMonths < 1 ||
    input.horizonMonths > MAX_HORIZON_MONTHS
  ) {
    issues.push({
      field: 'horizonMonths',
      code: 'VALIDATION_FAILED',
      detail: `o horizonte deve estar entre 1 e ${MAX_HORIZON_MONTHS} meses`,
    });
  }

  return {
    issues,
    prorationRequired: isProrationRequired(input.groupingLevelIds, context.levels),
    zeroHeavyWarning:
      input.accuracyMetric === 'MAPE' && context.zeroMonthProportion > ZERO_HEAVY_THRESHOLD,
  };
}

/**
 * FR-032d — quando a combinação escolhida já reproduz a granularidade original
 * do arquivo, não há o que ratear: a previsão sai direto no nível do item.
 */
export function isProrationRequired(
  groupingLevelIds: readonly string[],
  levels: readonly SegmentationLevelRef[],
): boolean {
  if (levels.length === 0) return false;
  const selected = new Set(groupingLevelIds);
  return !levels.every((level) => selected.has(level.id));
}
