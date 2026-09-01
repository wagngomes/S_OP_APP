import { describe, expect, it } from 'vitest';
import { consolidate, type RawSalesRow } from '../../src/ingestion/deduplicate.js';

const row = (over: Partial<RawSalesRow> = {}): RawSalesRow => ({
  productCode: 'P1',
  segments: ['ESP', 'Delivery', '1029'],
  year: 2026,
  month: 3,
  quantity: '10.000000',
  ...over,
});

describe('consolidação de duplicadas (FR-028)', () => {
  it('mantém linhas distintas intactas', () => {
    const result = consolidate([row(), row({ productCode: 'P2' })]);
    expect(result.rows).toHaveLength(2);
    expect(result.duplicatesConsolidated).toBe(0);
  });

  it('soma as quantidades da mesma chave', () => {
    const result = consolidate([row({ quantity: '10.000000' }), row({ quantity: '5.500000' })]);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.quantity).toBe('15.500000');
    expect(result.duplicatesConsolidated).toBe(1);
  });

  it('soma sem erro de ponto flutuante', () => {
    const result = consolidate([row({ quantity: '0.100000' }), row({ quantity: '0.200000' })]);
    expect(result.rows[0]?.quantity).toBe('0.300000');
  });

  it('trata devolução: negativo abate o positivo', () => {
    const result = consolidate([row({ quantity: '10.000000' }), row({ quantity: '-3.000000' })]);
    expect(result.rows[0]?.quantity).toBe('7.000000');
  });

  it('a chave inclui produto, segmentos, ano e mês', () => {
    const rows = [
      row(),
      row({ month: 4 }),
      row({ year: 2025 }),
      row({ segments: ['ESP', 'Delivery', '9999'] }),
    ];
    expect(consolidate(rows).rows).toHaveLength(4);
  });

  it('distingue segmentos por ordem, não só por conteúdo', () => {
    const rows = [
      row({ segments: ['A', 'B', 'C'] }),
      row({ segments: ['C', 'B', 'A'] }),
    ];
    expect(consolidate(rows).rows).toHaveLength(2);
  });

  it('conta cada ocorrência extra, não cada grupo', () => {
    const result = consolidate([row(), row(), row()]);
    expect(result.rows).toHaveLength(1);
    expect(result.duplicatesConsolidated).toBe(2);
  });

  it('preserva a ordem da primeira aparição, para o resultado ser determinístico', () => {
    const result = consolidate([row({ productCode: 'B' }), row({ productCode: 'A' })]);
    expect(result.rows.map((r) => r.productCode)).toEqual(['B', 'A']);
  });

  it('devolve lista vazia para entrada vazia', () => {
    expect(consolidate([])).toEqual({ rows: [], duplicatesConsolidated: 0 });
  });
});
