import { describe, expect, it } from 'vitest';
import {
  checkItemVersion,
  supersede,
  type AdjustmentRecord,
} from '../../src/collaboration/concurrency.js';
import { validateAdjustment } from '../../src/collaboration/adjustment.js';

describe('validação do ajuste (FR-057, FR-058, FR-059)', () => {
  const valid = { quantity: '120.000000', reason: 'promoção confirmada com o cliente' };

  it('aceita ajuste com motivo', () => {
    expect(validateAdjustment(valid)).toEqual([]);
  });

  it('recusa ajuste sem motivo', () => {
    expect(validateAdjustment({ ...valid, reason: '' })).not.toEqual([]);
  });

  it('recusa motivo só com espaços — não é justificativa', () => {
    const issues = validateAdjustment({ ...valid, reason: '   ' });
    expect(issues[0]?.code).toBe('REASON_REQUIRED');
  });

  it('recusa motivo curto demais para explicar algo', () => {
    expect(validateAdjustment({ ...valid, reason: 'ok' })).not.toEqual([]);
  });

  it('recusa quantidade negativa — venda prevista não é negativa (FR-040a)', () => {
    const issues = validateAdjustment({ ...valid, quantity: '-10.000000' });
    expect(issues.some((i) => i.field === 'quantity')).toBe(true);
  });

  it('aceita zero: o colaborador pode prever que não vende', () => {
    expect(validateAdjustment({ ...valid, quantity: '0.000000' })).toEqual([]);
  });

  it('recusa quantidade fora da gramática decimal', () => {
    expect(validateAdjustment({ ...valid, quantity: '1e3' })).not.toEqual([]);
    expect(validateAdjustment({ ...valid, quantity: '12.3456789' })).not.toEqual([]);
  });

  it('recusa quantidade como número, não string (Princípio V)', () => {
    const issues = validateAdjustment({
      ...valid,
      quantity: 120.5 as unknown as string,
    });
    expect(issues).not.toEqual([]);
  });
});

describe('edição concorrente (FR-066a, FR-066b)', () => {
  const adj = (over: Partial<AdjustmentRecord> = {}): AdjustmentRecord => ({
    id: 'a1',
    authorId: 'u1',
    quantity: '100.000000',
    reason: 'ajuste inicial do time comercial',
    origin: 'UI',
    createdAt: '2026-09-01T10:00:00.000Z',
    supersededById: null,
    ...over,
  });

  it('aceita quando a versão esperada bate', () => {
    expect(checkItemVersion(3, 3).allowed).toBe(true);
  });

  it('recusa quando alguém alterou o item no meio do caminho', () => {
    const r = checkItemVersion(4, 3);
    expect(r.allowed).toBe(false);
    expect(r.allowed === false && r.code).toBe('ITEM_CHANGED');
  });

  it('aceita quando o cliente não declara versão — ele assume o risco', () => {
    expect(checkItemVersion(4, undefined).allowed).toBe(true);
  });

  it('a versão esperada não pode ser maior que a atual', () => {
    expect(checkItemVersion(2, 5).allowed).toBe(false);
  });

  it('o ajuste anterior é marcado como superado, não apagado', () => {
    const anterior = adj({ id: 'a1' });
    const novo = adj({ id: 'a2', authorId: 'u2', quantity: '150.000000' });
    const chain = supersede([anterior], novo);

    expect(chain).toHaveLength(2);
    expect(chain[0]?.supersededById).toBe('a2');
    expect(chain[1]?.supersededById).toBeNull();
  });

  it('preserva o histórico completo das contribuições', () => {
    let chain: AdjustmentRecord[] = [adj({ id: 'a1' })];
    chain = supersede(chain, adj({ id: 'a2' }));
    chain = supersede(chain, adj({ id: 'a3' }));

    expect(chain.map((a) => a.id)).toEqual(['a1', 'a2', 'a3']);
    expect(chain.filter((a) => a.supersededById === null)).toHaveLength(1);
  });

  it('o número valendo é sempre o do último ajuste', () => {
    const chain = supersede([adj({ id: 'a1', quantity: '100.000000' })], adj({ id: 'a2', quantity: '150.000000' }));
    const vigente = chain.find((a) => a.supersededById === null);
    expect(vigente?.quantity).toBe('150.000000');
  });

  it('primeiro ajuste de um item não supera ninguém', () => {
    const chain = supersede([], adj({ id: 'a1' }));
    expect(chain).toHaveLength(1);
    expect(chain[0]?.supersededById).toBeNull();
  });
});
