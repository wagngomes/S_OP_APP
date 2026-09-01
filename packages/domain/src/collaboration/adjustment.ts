import Decimal from 'decimal.js';

/**
 * Regras do ajuste de colaboração (FR-057, FR-058, FR-059).
 *
 * O motivo é obrigatório e é o coração desta fase: um número alterado sem
 * justificativa não sobrevive ao consenso, porque ninguém consegue defendê-lo.
 */

const DECIMAL_GRAMMAR = /^-?\d+(\.\d{1,6})?$/;

/** Curto demais não explica nada; o campo viraria formalidade. */
const MIN_REASON_LENGTH = 5;

export type AdjustmentInput = {
  quantity: string;
  reason: string;
};

export type AdjustmentIssue = {
  field: 'quantity' | 'reason';
  code: 'REASON_REQUIRED' | 'VALIDATION_FAILED';
  detail: string;
};

export function validateAdjustment(input: AdjustmentInput): AdjustmentIssue[] {
  const issues: AdjustmentIssue[] = [];

  const reason = typeof input.reason === 'string' ? input.reason.trim() : '';
  if (reason.length === 0) {
    issues.push({
      field: 'reason',
      code: 'REASON_REQUIRED',
      detail: 'toda alteração exige um motivo (FR-058)',
    });
  } else if (reason.length < MIN_REASON_LENGTH) {
    issues.push({
      field: 'reason',
      code: 'REASON_REQUIRED',
      detail: `o motivo precisa ter ao menos ${MIN_REASON_LENGTH} caracteres`,
    });
  }

  if (typeof input.quantity !== 'string' || !DECIMAL_GRAMMAR.test(input.quantity)) {
    // Aceitar um número aqui reintroduziria o ponto flutuante que o Princípio V
    // mantém fora do sistema.
    issues.push({
      field: 'quantity',
      code: 'VALIDATION_FAILED',
      detail: 'a quantidade deve ser uma string decimal com até 6 casas',
    });
    return issues;
  }

  if (new Decimal(input.quantity).isNegative()) {
    issues.push({
      field: 'quantity',
      code: 'VALIDATION_FAILED',
      detail: 'a previsão de venda não pode ser negativa (FR-040a)',
    });
  }

  return issues;
}
