import Decimal from 'decimal.js';

/**
 * Regras da decisão de consenso (FR-070, FR-072).
 *
 * A decisão declara COM QUAL número seguir e de onde ele veio. A origem é
 * verificada contra o número informado — não é redundância: sem isso, uma
 * decisão marcada como "seguimos o calculado" poderia carregar um terceiro
 * número, e a trilha de auditoria passaria a mentir sobre o que foi decidido.
 */

const DECIMAL_GRAMMAR = /^-?\d+(\.\d{1,6})?$/;
const MIN_REASON_LENGTH = 5;

export type ConsensusSource = 'CALCULATED' | 'COLLABORATED' | 'MANUAL';

export type DecisionInput = {
  source: ConsensusSource;
  quantity: string;
  reason?: string;
  calculated: string;
  collaborated: string | null;
};

export type DecisionIssue = {
  field: 'quantity' | 'reason' | 'source';
  code: 'VALIDATION_FAILED' | 'REASON_REQUIRED';
  detail: string;
};

export function validateDecision(input: DecisionInput): DecisionIssue[] {
  const issues: DecisionIssue[] = [];

  if (typeof input.quantity !== 'string' || !DECIMAL_GRAMMAR.test(input.quantity)) {
    issues.push({
      field: 'quantity',
      code: 'VALIDATION_FAILED',
      detail: 'a quantidade deve ser uma string decimal com até 6 casas',
    });
    return issues;
  }

  const quantity = new Decimal(input.quantity);

  if (quantity.isNegative()) {
    issues.push({
      field: 'quantity',
      code: 'VALIDATION_FAILED',
      detail: 'o número consensado não pode ser negativo (FR-040a)',
    });
  }

  // Item sem colaboração: o colaborado é o próprio calculado (FR-070).
  const collaborated = input.collaborated ?? input.calculated;

  if (input.source === 'CALCULATED' && !quantity.equals(new Decimal(input.calculated))) {
    issues.push({
      field: 'quantity',
      code: 'VALIDATION_FAILED',
      detail: `seguir com o calculado exige a quantidade ${input.calculated}`,
    });
  }

  if (input.source === 'COLLABORATED' && !quantity.equals(new Decimal(collaborated))) {
    issues.push({
      field: 'quantity',
      code: 'VALIDATION_FAILED',
      detail: `seguir com o colaborado exige a quantidade ${collaborated}`,
    });
  }

  if (input.source === 'MANUAL') {
    const reason = typeof input.reason === 'string' ? input.reason.trim() : '';
    if (reason.length < MIN_REASON_LENGTH) {
      issues.push({
        field: 'reason',
        code: 'REASON_REQUIRED',
        detail: 'um terceiro número exige motivo declarado',
      });
    }
  }

  return issues;
}
