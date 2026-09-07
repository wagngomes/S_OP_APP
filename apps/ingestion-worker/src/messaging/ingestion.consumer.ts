import { IngestionRequestPayload } from '@sop/contracts';
import { parseCsvStream } from '../application/csv-stream-parser.js';
import { persistCollaborationSheet } from '../application/persist-collaboration-sheet.js';
import { persistHistory } from '../application/persist-history.js';
import { buildValidationReport } from '../application/validation-report.js';
import type { IngestionWorkerPorts } from '../composition/ports.js';

/**
 * Consumidor de `sop.ingestion.request.v1` (T106, T138).
 *
 * Roteia para o handler correto com base no `kind` do payload:
 *   - SALES_HISTORY  → persist-history
 *   - COLLABORATION_SHEET → persist-collaboration-sheet
 */
export async function processIngestionRequest(
  rawPayload: unknown,
  ports: IngestionWorkerPorts,
): Promise<void> {
  const payload = IngestionRequestPayload.parse(rawPayload);
  const { jobId, objectUri, declaredLabels, scenarioId, uploadedById, kind } = payload;

  if (kind === 'COLLABORATION_SHEET') {
    if (!ports.collaboration) {
      throw new Error('CollaborationPort não configurado para COLLABORATION_SHEET');
    }
    const stream = await ports.objectStore.getStream(objectUri);
    await persistCollaborationSheet(jobId, scenarioId, uploadedById, stream, {
      job: ports.job,
      collaboration: ports.collaboration,
      issues: ports.issues,
    });
    return;
  }

  // SALES_HISTORY (and fallback for ACTUAL_SALES)
  await ports.job.startJob(jobId);

  try {
    const stream = await ports.objectStore.getStream(objectUri);
    const parseResult = await parseCsvStream(stream, declaredLabels);
    const report = buildValidationReport(parseResult, declaredLabels);

    await persistHistory(jobId, scenarioId, parseResult.rows, report.issues, ports);

    await ports.job.completeJob(jobId, {
      totalRows: report.totalRows,
      validRows: report.validRows,
      invalidRows: report.invalidRows,
      issueCount: report.issues.length,
      issueCapReached: report.issueCapReached,
    });
  } catch (err) {
    await ports.job.failJob(jobId, err instanceof Error ? err.message : String(err));
    throw err;
  }
}
