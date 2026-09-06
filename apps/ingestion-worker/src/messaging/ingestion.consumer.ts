import { IngestionRequestPayload } from '@sop/contracts';
import { parseCsvStream } from '../application/csv-stream-parser.js';
import { persistHistory } from '../application/persist-history.js';
import { buildValidationReport } from '../application/validation-report.js';
import type { IngestionWorkerPorts } from '../composition/ports.js';

/**
 * Consumidor de `sop.ingestion.request.v1` (T106).
 *
 * Fluxo:
 *  1. Marca o job como PROCESSING.
 *  2. Lê o CSV em streaming do MinIO.
 *  3. Faz o parse linha a linha (T107) — não aborta na primeira linha ruim.
 *  4. Constrói o relatório de issues (T108, FR-024).
 *  5. Persiste os registros válidos e as issues (T109).
 *  6. Marca o job como COMPLETED com os contadores finais.
 *  7. Em caso de falha inesperada, marca o job como FAILED e relança.
 *
 * A deduplicação de entrega (D6) fica a cargo do idempotent-consumer que
 * chama esta função — aqui não há verificação de jobId processado.
 */
export async function processIngestionRequest(
  rawPayload: unknown,
  ports: IngestionWorkerPorts,
): Promise<void> {
  const payload = IngestionRequestPayload.parse(rawPayload);
  const { jobId, objectUri, declaredLabels, scenarioId } = payload;

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
