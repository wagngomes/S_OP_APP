import Decimal from 'decimal.js';
import { z } from 'zod';

/**
 * Codec decimal — a fonte única de como grandeza numérica atravessa qualquer
 * fronteira do SOP_APP.
 *
 * Este arquivo sustenta o Princípio V da constituição. Se ele quebrar, a precisão
 * exigida some sem erro e sem aviso, e reaparece meses depois na conciliação.
 *
 * Ver: specs/001-sop-cycle-forecasting/contracts/decimal-codec.md
 */

/** Casas decimais de quantidade, previsão e métrica. */
export const DECIMAL_SCALE = 6;

/** Política de arredondamento única do sistema: HALF_UP. */
export const DECIMAL_ROUNDING = Decimal.ROUND_HALF_UP;

/**
 * Gramática aceita ao ATRAVESSAR a fronteira.
 *
 * No máximo `scale` casas: mais que isso é erro de quem produziu o valor, e
 * arredondar em silêncio esconderia justamente o defeito que se quer ver.
 * Sem notação científica, sem separador de milhar, sem espaços.
 */
const grammar = (scale: number): RegExp => new RegExp(`^-?\\d+(\\.\\d{1,${scale}})?$`);

/** Verifica a gramática sem lançar. */
export function isDecimalString(value: unknown, scale: number = DECIMAL_SCALE): boolean {
  return typeof value === 'string' && grammar(scale).test(value);
}

/**
 * Schema Zod para todo campo de grandeza sensível.
 *
 * Use SEMPRE isto no lugar de `z.number()`. Um número JSON seria convertido
 * para double pelo parser antes de qualquer validação — o erro entraria antes
 * de haver o que validar.
 */
export function DecimalString(scale: number = DECIMAL_SCALE) {
  return z
    .string({ error: 'grandeza sensível deve trafegar como string decimal' })
    .regex(grammar(scale), `decimal inválido: esperado até ${scale} casas, sem notação científica`)
    .transform((s) => new Decimal(s).toFixed(scale));
}

/** Converte para aritmética exata. Nunca passe por `Number`. */
export function toDecimal(value: string | Decimal): Decimal {
  return value instanceof Decimal ? value : new Decimal(value);
}

/**
 * Traz um valor de precisão arbitrária para a escala do sistema.
 *
 * Distinto de `DecimalString`: aqui casas extras são ESPERADAS e devem ser
 * arredondadas. É a conversão usada na saída do motor de cálculo, ao trazer o
 * resultado de volta do float64 — a única região do sistema onde float existe.
 */
export function quantize(
  value: string | number | Decimal,
  scale: number = DECIMAL_SCALE,
): string {
  const d = value instanceof Decimal ? value : new Decimal(value);
  const quantized = d.toDecimalPlaces(scale, DECIMAL_ROUNDING);
  // -0 e 0 são o mesmo número; o contrato tem uma única forma canônica.
  return quantized.isZero() ? new Decimal(0).toFixed(scale) : quantized.toFixed(scale);
}

/** Tipo do valor já validado e canonicalizado. */
export type DecimalStringValue = string;
