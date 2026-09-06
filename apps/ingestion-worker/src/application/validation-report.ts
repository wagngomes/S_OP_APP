import type { CsvParseResult, ParseError } from './csv-stream-parser.js';

/**
 * Acumulador do relatório de validação (T108, FR-024).
 *
 * O worker nunca aborta na primeira linha ruim: acumula o relatório completo
 * até `ISSUE_CAP` ocorrências e então para de registrar (mas continua
 * contabilizando as linhas para os totais).
 */

export const ISSUE_CAP = 1_000;

export type IssueReportRow = {
  lineNumber: number;
  column?: string;
  code: string;
  detail: string;
};

export type ValidationSummary = {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  issues: IssueReportRow[];
  issueCapReached: boolean;
};

/**
 * Constrói o resumo de validação a partir do resultado do parse.
 *
 * Erros do parser (linhas que não puderam ser parseadas) são tratados como
 * linhas inválidas. Só linhas sem nenhum erro entram em `validRows`.
 */
export function buildValidationReport(
  result: CsvParseResult,
  _declaredLabels: string[],
): ValidationSummary {
  const { rows, errors } = result;

  // Agrupa erros por linha para contagem correta de invalidRows
  const invalidLines = new Set<number>(errors.map((e) => e.lineNumber));

  // Remove a linha 1 (cabeçalho) da contagem de linhas de dados
  invalidLines.delete(1);

  const totalRows = rows.length + invalidLines.size;
  const invalidRows = invalidLines.size;
  const validRows = rows.length;

  const issues: IssueReportRow[] = [];
  let issueCapReached = false;

  // Filtra erros de cabeçalho (lineNumber === 1) — não são "linhas de dados"
  const dataErrors = errors.filter((e) => e.lineNumber !== 1);

  for (const err of dataErrors) {
    if (issues.length >= ISSUE_CAP) {
      issueCapReached = true;
      break;
    }
    issues.push({
      lineNumber: err.lineNumber,
      column: err.column,
      code: err.code,
      detail: err.detail,
    });
  }

  return { totalRows, validRows, invalidRows, issues, issueCapReached };
}
