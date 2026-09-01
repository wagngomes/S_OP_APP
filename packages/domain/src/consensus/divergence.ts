import Decimal from 'decimal.js';

/**
 * Divergência entre o número calculado e o colaborado (FR-067, FR-068, FR-069).
 *
 * Aritmética de processo, não estatística — por isso vive aqui e não no motor
 * (ver a tabela de fronteira de cálculo em plan.md). Ainda assim é decimal
 * exata: é sobre estes números que a decisão de consenso é tomada.
 */

const SCALE = 6;

export type ToleranceKind = 'ABSOLUTE' | 'PERCENT';

export type Tolerance = {
  value: string;
  kind: ToleranceKind;
};

export type Divergence = {
  /** Diferença com sinal: positivo quando o colaborado é maior. */
  signed: string;
  /** Módulo da diferença — é por ele que se ordena (FR-069). */
  absolute: string;
  /** Fração sobre o calculado; nulo quando o calculado é zero. */
  percent: string | null;
};

export type DivergenceItem = {
  id: string;
  calculated: string;
  collaborated: string | null;
};

/**
 * Calcula a divergência de um item.
 *
 * Item sem colaboração tem divergência ZERO, não indefinida: ninguém alterou,
 * então o número colaborado É o calculado (FR-070).
 */
export function computeDivergence(calculated: string, collaborated: string | null): Divergence {
  const calc = new Decimal(calculated);
  const collab = collaborated === null ? calc : new Decimal(collaborated);
  const signed = collab.minus(calc);

  return {
    signed: signed.toFixed(SCALE),
    absolute: signed.abs().toFixed(SCALE),
    // Dividir por zero produziria um percentual sem significado; o absoluto
    // continua válido e é o que se usa nesse caso.
    percent: calc.isZero() ? null : signed.div(calc).toDecimalPlaces(SCALE).toFixed(SCALE),
  };
}

/**
 * Se a divergência cabe na faixa aceitável definida pelo responsável.
 *
 * Sem faixa definida, nada é sinalizado — a tela mostra tudo e o responsável
 * decide o que olhar.
 */
export function isWithinTolerance(divergence: Divergence, tolerance: Tolerance | null): boolean {
  if (tolerance === null) return true;

  const limit = new Decimal(tolerance.value);

  if (tolerance.kind === 'ABSOLUTE') {
    return new Decimal(divergence.absolute).lte(limit);
  }

  if (divergence.percent === null) {
    // Percentual indefinido (calculado zero): o item fica FORA da faixa de
    // propósito, para aparecer na revisão em vez de sumir dela.
    return new Decimal(divergence.absolute).isZero();
  }

  return new Decimal(divergence.percent).abs().lte(limit);
}

/**
 * Ordena pelas maiores divergências, para revisão focada (FR-069).
 *
 * Usa o módulo: divergir para baixo importa tanto quanto para cima. Empate é
 * resolvido pela ordem original, para o resultado ser determinístico.
 */
export function sortByDivergence<T extends DivergenceItem>(items: readonly T[]): T[] {
  return items
    .map((item, index) => ({
      item,
      index,
      magnitude: new Decimal(computeDivergence(item.calculated, item.collaborated).absolute),
    }))
    .sort((a, b) => {
      const comparison = b.magnitude.comparedTo(a.magnitude);
      return comparison !== 0 ? comparison : a.index - b.index;
    })
    .map(({ item }) => item);
}
