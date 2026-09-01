import { describe, expect, it } from 'vitest';
import {
  computeDivergence,
  isWithinTolerance,
  sortByDivergence,
  type DivergenceItem,
} from '../../src/consensus/divergence.js';
import { validateDecision } from '../../src/consensus/decision-rules.js';

describe('divergência entre calculado e colaborado (FR-067, FR-068)', () => {
  it('mede a diferença absoluta', () => {
    const d = computeDivergence('100.000000', '120.000000');
    expect(d.absolute).toBe('20.000000');
  });

  it('a diferença é positiva quando o colaborado é maior', () => {
    expect(computeDivergence('100.000000', '120.000000').signed).toBe('20.000000');
  });

  it('a diferença é negativa quando o colaborado é menor', () => {
    expect(computeDivergence('100.000000', '80.000000').signed).toBe('-20.000000');
  });

  it('mede a diferença percentual sobre o calculado', () => {
    expect(computeDivergence('100.000000', '120.000000').percent).toBe('0.200000');
  });

  it('percentual é indefinido quando o calculado é zero', () => {
    // Dividir por zero aqui produziria um número sem significado; o absoluto
    // continua válido e é o que se usa nesse caso.
    const d = computeDivergence('0.000000', '50.000000');
    expect(d.percent).toBeNull();
    expect(d.absolute).toBe('50.000000');
  });

  it('item sem colaboração tem divergência zero, não indefinida', () => {
    // Ninguém alterou: o colaborado É o calculado (FR-070).
    const d = computeDivergence('100.000000', null);
    expect(d.absolute).toBe('0.000000');
    expect(d.percent).toBe('0.000000');
  });

  it('aritmética é exata, sem ponto flutuante', () => {
    expect(computeDivergence('0.300000', '0.100000').absolute).toBe('0.200000');
  });
});

describe('faixa aceitável (FR-067, FR-068)', () => {
  it('aceita dentro da faixa absoluta', () => {
    const d = computeDivergence('100.000000', '105.000000');
    expect(isWithinTolerance(d, { value: '10.000000', kind: 'ABSOLUTE' })).toBe(true);
  });

  it('sinaliza fora da faixa absoluta', () => {
    const d = computeDivergence('100.000000', '120.000000');
    expect(isWithinTolerance(d, { value: '10.000000', kind: 'ABSOLUTE' })).toBe(false);
  });

  it('a faixa vale para os dois lados', () => {
    const abaixo = computeDivergence('100.000000', '80.000000');
    expect(isWithinTolerance(abaixo, { value: '10.000000', kind: 'ABSOLUTE' })).toBe(false);
  });

  it('aceita dentro da faixa percentual', () => {
    const d = computeDivergence('100.000000', '105.000000');
    expect(isWithinTolerance(d, { value: '0.100000', kind: 'PERCENT' })).toBe(true);
  });

  it('faixa percentual com calculado zero cai para o absoluto', () => {
    const d = computeDivergence('0.000000', '5.000000');
    // Sem percentual definido, qualquer diferença fica FORA da faixa: é o
    // comportamento seguro, porque o item aparece para revisão em vez de sumir.
    expect(isWithinTolerance(d, { value: '0.100000', kind: 'PERCENT' })).toBe(false);
  });

  it('faixa zero significa que tudo diverge, exceto o idêntico', () => {
    const igual = computeDivergence('100.000000', '100.000000');
    const diferente = computeDivergence('100.000000', '100.000001');
    expect(isWithinTolerance(igual, { value: '0.000000', kind: 'ABSOLUTE' })).toBe(true);
    expect(isWithinTolerance(diferente, { value: '0.000000', kind: 'ABSOLUTE' })).toBe(false);
  });

  it('sem faixa definida, nada é sinalizado', () => {
    const d = computeDivergence('100.000000', '900.000000');
    expect(isWithinTolerance(d, null)).toBe(true);
  });
});

describe('ordenação pelas maiores divergências (FR-069)', () => {
  const items: DivergenceItem[] = [
    { id: 'a', calculated: '100.000000', collaborated: '105.000000' },
    { id: 'b', calculated: '100.000000', collaborated: '300.000000' },
    { id: 'c', calculated: '100.000000', collaborated: '50.000000' },
  ];

  it('ordena do maior para o menor desvio', () => {
    expect(sortByDivergence(items).map((i) => i.id)).toEqual(['b', 'c', 'a']);
  });

  it('usa o módulo: divergir para baixo conta tanto quanto para cima', () => {
    const sorted = sortByDivergence([
      { id: 'sobe', calculated: '100.000000', collaborated: '150.000000' },
      { id: 'desce', calculated: '100.000000', collaborated: '40.000000' },
    ]);
    expect(sorted[0]?.id).toBe('desce');
  });

  it('empate é resolvido pela ordem original, para ser determinístico', () => {
    const sorted = sortByDivergence([
      { id: 'x', calculated: '100.000000', collaborated: '110.000000' },
      { id: 'y', calculated: '100.000000', collaborated: '90.000000' },
    ]);
    expect(sorted.map((i) => i.id)).toEqual(['x', 'y']);
  });

  it('lista vazia não quebra', () => {
    expect(sortByDivergence([])).toEqual([]);
  });
});

describe('decisão de consenso (FR-070, FR-072)', () => {
  const base = { calculated: '100.000000', collaborated: '120.000000' };

  it('seguir com o calculado exige a quantidade igual ao calculado', () => {
    expect(validateDecision({ source: 'CALCULATED', quantity: '100.000000', ...base })).toEqual([]);
    expect(
      validateDecision({ source: 'CALCULATED', quantity: '111.000000', ...base }),
    ).not.toEqual([]);
  });

  it('seguir com o colaborado exige a quantidade igual ao colaborado', () => {
    expect(validateDecision({ source: 'COLLABORATED', quantity: '120.000000', ...base })).toEqual(
      [],
    );
    expect(
      validateDecision({ source: 'COLLABORATED', quantity: '100.000000', ...base }),
    ).not.toEqual([]);
  });

  it('um terceiro número exige motivo', () => {
    expect(
      validateDecision({ source: 'MANUAL', quantity: '110.000000', ...base }),
    ).not.toEqual([]);
    expect(
      validateDecision({
        source: 'MANUAL',
        quantity: '110.000000',
        reason: 'acordo fechado na reunião de consenso',
        ...base,
      }),
    ).toEqual([]);
  });

  it('recusa decisão negativa', () => {
    expect(
      validateDecision({
        source: 'MANUAL',
        quantity: '-1.000000',
        reason: 'motivo suficientemente descritivo',
        ...base,
      }),
    ).not.toEqual([]);
  });

  it('seguir com o colaborado quando ninguém colaborou usa o calculado', () => {
    expect(
      validateDecision({
        source: 'COLLABORATED',
        quantity: '100.000000',
        calculated: '100.000000',
        collaborated: null,
      }),
    ).toEqual([]);
  });
});
