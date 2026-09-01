import { describe, expect, it } from 'vitest';
import golden from '../src/golden/decimal.json' with { type: 'json' };
import {
  DECIMAL_SCALE,
  DecimalString,
  isDecimalString,
  quantize,
  toDecimal,
} from '../src/decimal/decimal-string.js';

describe('codec decimal — constantes do contrato', () => {
  it('usa a escala declarada nos vetores dourados', () => {
    expect(DECIMAL_SCALE).toBe(golden.scale);
  });
});

describe('DecimalString — travessia da fronteira', () => {
  for (const { input, canonical } of golden.parse.accept) {
    it(`aceita ${JSON.stringify(input)} e canonicaliza para ${canonical}`, () => {
      expect(DecimalString().parse(input)).toBe(canonical);
    });
  }

  for (const input of golden.parse.reject) {
    it(`rejeita ${JSON.stringify(input)}`, () => {
      expect(() => DecimalString().parse(input)).toThrow();
      expect(isDecimalString(input)).toBe(false);
    });
  }

  it('rejeita número JSON, não apenas string malformada', () => {
    // Este é o ponto do Princípio V: aceitar 1.5 como number reintroduziria
    // o ponto flutuante que o contrato existe para manter fora.
    expect(() => DecimalString().parse(1.5 as unknown as string)).toThrow();
  });

  it('rejeita null e undefined', () => {
    expect(() => DecimalString().parse(null as unknown as string)).toThrow();
    expect(() => DecimalString().parse(undefined as unknown as string)).toThrow();
  });
});

describe('quantize — saída do motor de volta para decimal', () => {
  for (const { input, expected } of golden.quantize.cases) {
    it(`${input} → ${expected} com HALF_UP`, () => {
      expect(quantize(input)).toBe(expected);
    });
  }

  it('quantiza a partir de um float, que é a origem real do caso', () => {
    expect(quantize(0.1 + 0.2)).toBe('0.300000');
  });
});

describe('toDecimal — conversão para aritmética exata', () => {
  it('preserva o valor sem passar por Number', () => {
    const d = toDecimal('1234567890123.123456');
    expect(d.toFixed(DECIMAL_SCALE)).toBe('1234567890123.123456');
  });

  it('soma sem erro de ponto flutuante', () => {
    const total = toDecimal('0.1').plus(toDecimal('0.2'));
    expect(total.toFixed(DECIMAL_SCALE)).toBe('0.300000');
  });
});
