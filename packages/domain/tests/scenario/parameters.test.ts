import { describe, expect, it } from 'vitest';
import { validateParameters, type ParametersInput } from '../../src/scenario/parameters.js';

const levels = [
  { id: 'l-bu', position: 0, label: 'BU' },
  { id: 'l-setor', position: 1, label: 'Setor' },
  { id: 'l-cd', position: 2, label: 'CD' },
];

const input = (over: Partial<ParametersInput> = {}): ParametersInput => ({
  groupingLevelIds: ['l-bu', 'l-setor'],
  prorationMonths: 12,
  accuracyMetric: 'WMAPE',
  modelPackage: 'STANDARD',
  horizonMonths: 12,
  ...over,
});

const context = { levels, availableHistoryMonths: 24, zeroMonthProportion: 0.1 };

describe('combinação de níveis (FR-032)', () => {
  it('aceita combinação de dois níveis', () => {
    expect(validateParameters(input(), context).issues).toEqual([]);
  });

  it('aceita um único nível', () => {
    expect(validateParameters(input({ groupingLevelIds: ['l-bu'] }), context).issues).toEqual([]);
  });

  it('recusa combinação vazia (FR-032c)', () => {
    const r = validateParameters(input({ groupingLevelIds: [] }), context);
    expect(r.issues.map((i) => i.field)).toContain('groupingLevelIds');
  });

  it('recusa nível repetido (FR-032b)', () => {
    const r = validateParameters(input({ groupingLevelIds: ['l-bu', 'l-bu'] }), context);
    expect(r.issues[0]?.code).toBe('VALIDATION_FAILED');
  });

  it('recusa nível que não pertence ao cenário', () => {
    const r = validateParameters(input({ groupingLevelIds: ['l-inexistente'] }), context);
    expect(r.issues).not.toEqual([]);
  });
});

describe('rateio necessário (FR-032d)', () => {
  it('exige rateio quando a combinação é mais agregada que a granularidade', () => {
    expect(validateParameters(input(), context).prorationRequired).toBe(true);
  });

  it('dispensa rateio quando a combinação já é a granularidade original', () => {
    const r = validateParameters(input({ groupingLevelIds: ['l-bu', 'l-setor', 'l-cd'] }), context);
    expect(r.prorationRequired).toBe(false);
  });
});

describe('meses de rateio (FR-034)', () => {
  it('aceita valor dentro do histórico disponível', () => {
    expect(validateParameters(input({ prorationMonths: 24 }), context).issues).toEqual([]);
  });

  it('recusa mais meses do que existe no histórico', () => {
    const r = validateParameters(input({ prorationMonths: 36 }), context);
    expect(r.issues.map((i) => i.field)).toContain('prorationMonths');
  });

  it('recusa zero e negativo', () => {
    expect(validateParameters(input({ prorationMonths: 0 }), context).issues).not.toEqual([]);
    expect(validateParameters(input({ prorationMonths: -1 }), context).issues).not.toEqual([]);
  });
});

describe('pacote de modelos e métrica (FR-034b, FR-035)', () => {
  it('recusa parametrização sem pacote', () => {
    const r = validateParameters(
      input({ modelPackage: undefined as unknown as ParametersInput['modelPackage'] }),
      context,
    );
    expect(r.issues.map((i) => i.field)).toContain('modelPackage');
  });

  it('recusa parametrização sem métrica', () => {
    const r = validateParameters(
      input({ accuracyMetric: undefined as unknown as ParametersInput['accuracyMetric'] }),
      context,
    );
    expect(r.issues.map((i) => i.field)).toContain('accuracyMetric');
  });
});

describe('aviso de métrica indefinida (FR-036a)', () => {
  it('avisa ao escolher MAPE em cenário com muitos meses zerados', () => {
    const r = validateParameters(input({ accuracyMetric: 'MAPE' }), {
      ...context,
      zeroMonthProportion: 0.4,
    });
    expect(r.zeroHeavyWarning).toBe(true);
    expect(r.issues).toEqual([]); // é aviso, não impedimento
  });

  it('não avisa com MAPE em cenário sem zeros relevantes', () => {
    const r = validateParameters(input({ accuracyMetric: 'MAPE' }), context);
    expect(r.zeroHeavyWarning).toBe(false);
  });

  it('não avisa com WMAPE, que é definido com realizado zero', () => {
    const r = validateParameters(input({ accuracyMetric: 'WMAPE' }), {
      ...context,
      zeroMonthProportion: 0.9,
    });
    expect(r.zeroHeavyWarning).toBe(false);
  });
});

describe('horizonte', () => {
  it('recusa horizonte zero ou negativo', () => {
    expect(validateParameters(input({ horizonMonths: 0 }), context).issues).not.toEqual([]);
  });

  it('recusa horizonte absurdo', () => {
    expect(validateParameters(input({ horizonMonths: 121 }), context).issues).not.toEqual([]);
  });
});
