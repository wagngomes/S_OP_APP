import { consolidate } from '@sop/domain';
import type { IssueRow, IngestionWorkerPorts } from '../composition/ports.js';
import type { ParsedRow } from './csv-stream-parser.js';

/**
 * Persistência do histórico e das issues (T109).
 *
 * Antes de inserir, consolida as linhas duplicadas por soma (FR-028).
 * A consolidação usa aritmética decimal de `@sop/domain`, garantindo que a
 * soma não introduza erro de ponto flutuante (Princípio V).
 */
export async function persistHistory(
  jobId: string,
  scenarioId: string,
  parsedRows: ParsedRow[],
  issues: IssueRow[],
  ports: IngestionWorkerPorts,
): Promise<void> {
  if (parsedRows.length > 0) {
    const { rows: consolidated } = consolidate(
      parsedRows.map((r) => ({
        productCode: r.productCode,
        segments: r.segments,
        year: r.year,
        month: r.month,
        quantity: r.quantity,
      })),
    );

    await ports.history.bulkCreateSalesRecords(scenarioId, consolidated);
  }

  if (issues.length > 0) {
    await ports.issues.bulkCreateIssues(jobId, issues);
  }
}
