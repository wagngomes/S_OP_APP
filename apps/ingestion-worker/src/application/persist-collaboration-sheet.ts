import type { CollaborationPort, IssuePort, IssueRow, JobPort } from '../composition/ports.js';

/** Colunas que devem estar presentes em toda planilha de colaboração. */
const REQUIRED_COLUMNS = [
  'forecastItemId',
  'productCode',
  'period',
  'calculated_quantity',
  'adjusted_quantity',
  'reason',
] as const;

const SEGMENT_COLUMN_RE = /^segment_\d+$/;

type ColumnIndices = Record<string, number>;

function parseHeader(line: string): ColumnIndices | null {
  const headers = splitCsvLine(line);
  const indices: ColumnIndices = {};
  for (const [i, h] of headers.entries()) indices[h.trim()] = i;
  for (const col of REQUIRED_COLUMNS) {
    if (!(col in indices)) return null;
  }
  return indices;
}

/** CSV split simples — não suporta newlines dentro de células (basta para planilhas numéricas). */
function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (ch === ',' && !inQuotes) {
      cells.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  cells.push(cur);
  return cells;
}

async function collectLines(stream: NodeJS.ReadableStream): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (c: Buffer | string) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8').split('\n')));
    stream.on('error', reject);
  });
}

/**
 * Processa uma planilha de colaboração devolvida (FR-061, FR-062, FR-066c).
 *
 * FR-062 — estrutura alterada (coluna obrigatória ausente): falha o job inteiro.
 * FR-066c — item já alterado por terceiro: emite issue STALE_ITEM, aplica mesmo assim.
 */
export async function persistCollaborationSheet(
  jobId: string,
  scenarioId: string,
  uploadedById: string,
  stream: NodeJS.ReadableStream,
  ports: { job: JobPort; collaboration: CollaborationPort; issues: IssuePort },
): Promise<void> {
  await ports.job.startJob(jobId);

  try {
    const lines = (await collectLines(stream)).filter((l) => l.trim().length > 0);

    if (lines.length === 0) {
      throw new Error('planilha vazia');
    }

    const colIdx = parseHeader(lines[0]!);
    if (!colIdx) {
      // FR-062: rejeição integral quando estrutura foi alterada
      throw new Error('estrutura da planilha alterada — colunas obrigatórias ausentes');
    }

    // Parse data rows
    type DataRow = {
      lineNumber: number;
      forecastItemId: string;
      calculatedQuantity: string;
      adjustedQuantity: string;
      reason: string;
    };

    const dataRows: DataRow[] = [];
    const parseIssues: IssueRow[] = [];

    for (let i = 1; i < lines.length; i++) {
      const cells = splitCsvLine(lines[i]!);
      const forecastItemId = (cells[colIdx['forecastItemId']!] ?? '').trim();
      if (!forecastItemId) {
        parseIssues.push({ lineNumber: i + 1, column: 'forecastItemId', code: 'MISSING_VALUE', detail: 'forecastItemId ausente na linha' });
        continue;
      }
      dataRows.push({
        lineNumber: i + 1,
        forecastItemId,
        calculatedQuantity: (cells[colIdx['calculated_quantity']!] ?? '').trim(),
        adjustedQuantity: (cells[colIdx['adjusted_quantity']!] ?? '').trim(),
        reason: (cells[colIdx['reason']!] ?? '').trim(),
      });
    }

    const itemIds = dataRows.map((r) => r.forecastItemId);
    const itemMap = itemIds.length > 0
      ? await ports.collaboration.findItemsByIds(scenarioId, itemIds)
      : new Map<string, import('../composition/ports.js').CollaborationSheetItem>();

    const issues: IssueRow[] = [...parseIssues];
    let validRows = 0;
    const invalidRows = parseIssues.length;

    for (const row of dataRows) {
      const item = itemMap.get(row.forecastItemId);

      if (!item) {
        issues.push({ lineNumber: row.lineNumber, column: 'forecastItemId', code: 'ITEM_NOT_FOUND', detail: `item ${row.forecastItemId} não encontrado neste cenário` });
        continue;
      }

      // FR-066c: stale — item alterado por outro colaborador
      if (item.currentAdjustmentAuthorId && item.currentAdjustmentAuthorId !== uploadedById) {
        issues.push({ lineNumber: row.lineNumber, column: 'adjusted_quantity', code: 'STALE_ITEM', detail: `item ${row.forecastItemId} foi alterado por outro colaborador` });
        // Não bloqueia: continua aplicando o ajuste da planilha
      }

      const qty = row.adjustedQuantity || row.calculatedQuantity;
      const hasAdjustment = row.adjustedQuantity !== row.calculatedQuantity || row.reason.length > 0;

      if (hasAdjustment) {
        await ports.collaboration.createAdjustment({
          scenarioId,
          forecastItemId: row.forecastItemId,
          authorId: uploadedById,
          quantity: qty,
          reason: row.reason,
          origin: 'SPREADSHEET',
        });
      }

      validRows++;
    }

    if (issues.length > 0) {
      await ports.issues.bulkCreateIssues(jobId, issues);
    }

    const totalRows = dataRows.length + parseIssues.length;

    await ports.job.completeJob(jobId, {
      totalRows,
      validRows,
      invalidRows: totalRows - validRows,
      issueCount: issues.length,
      issueCapReached: false,
    });
  } catch (err) {
    await ports.job.failJob(jobId, err instanceof Error ? err.message : String(err));
    throw err;
  }
}
