/**
 * Validação do layout da Estrutura Comercial (FR-020 a FR-024).
 *
 * A regra central: toda linha do arquivo tem exatamente o mesmo número de
 * segmentos que os rótulos declarados. Divergência não é arredondada nem
 * adivinhada — é reportada, e nenhum cálculo roda sobre o arquivo.
 */

export const SEGMENT_SEPARATOR = ';';

export type IssueCode =
  | 'SEGMENT_COUNT_MISMATCH'
  | 'MISSING_COLUMN'
  | 'INVALID_NUMBER'
  | 'INVALID_PERIOD'
  | 'UNKNOWN_ITEM'
  | 'ALIEN_ITEM'
  | 'STRUCTURE_CHANGED';

export type ValidationIssue = {
  lineNumber: number;
  column?: string;
  code: IssueCode;
  detail: string;
};

/** Divide a declaração de layout (ex.: `BU;Setor;CD`) em rótulos. */
export function parseDeclaredLabels(declaration: string): string[] {
  return declaration.split(SEGMENT_SEPARATOR).map((label) => label.trim());
}

/**
 * Divide a Estrutura Comercial de uma linha.
 *
 * Sem `trim` no valor: um segmento é um código de negócio, e alterar o conteúdo
 * silenciosamente esconderia dado sujo em vez de expô-lo. Só a contagem importa
 * aqui.
 */
export function parseSegments(value: string): string[] {
  return value.split(SEGMENT_SEPARATOR);
}

/** Valida a declaração de layout feita pelo usuário na importação. */
export function validateDeclaredLabels(labels: readonly string[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (labels.length === 0) {
    issues.push({
      lineNumber: 0,
      code: 'MISSING_COLUMN',
      detail: 'declare ao menos um nível para a Estrutura Comercial',
    });
    return issues;
  }

  const blank = labels.filter((l) => l.trim().length === 0);
  if (blank.length > 0) {
    issues.push({
      lineNumber: 0,
      code: 'MISSING_COLUMN',
      detail: 'há rótulo em branco na declaração de layout',
    });
  }

  const seen = new Set<string>();
  const duplicated = new Set<string>();
  for (const label of labels) {
    const key = label.trim().toLowerCase();
    if (seen.has(key)) duplicated.add(label.trim());
    seen.add(key);
  }
  if (duplicated.size > 0) {
    issues.push({
      lineNumber: 0,
      code: 'STRUCTURE_CHANGED',
      // Rótulo repetido tornaria a hierarquia ambígua: não daria para saber a
      // qual posição o usuário se refere ao arrastar o nível.
      detail: `rótulo repetido na declaração: ${[...duplicated].join(', ')}`,
    });
  }

  return issues;
}

/**
 * Confere a contagem de segmentos de uma linha contra os rótulos declarados.
 *
 * Devolve `null` quando a linha está correta. Não lança: o chamador acumula o
 * relatório em vez de abortar na primeira linha ruim (FR-024).
 */
export function validateRowSegments(
  commercialStructure: string,
  declaredLabels: readonly string[],
  lineNumber: number,
): ValidationIssue | null {
  const segments = parseSegments(commercialStructure);
  if (segments.length === declaredLabels.length) return null;

  return {
    lineNumber,
    column: 'Estrutura Comercial',
    code: 'SEGMENT_COUNT_MISMATCH',
    detail:
      `esperados ${declaredLabels.length} segmentos (${declaredLabels.join(SEGMENT_SEPARATOR)}), ` +
      `encontrados ${segments.length}: "${commercialStructure}"`,
  };
}
