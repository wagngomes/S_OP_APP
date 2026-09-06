import { randomUUID } from 'node:crypto';
import { MESSAGING_VERSION } from '@sop/contracts';
import type { IngestionJobRecord, IngestionRepository, JobPublisher } from '../composition/ports.js';

/**
 * Serviço de ingestão (T097).
 *
 * Cria o IngestionJob e publica a referência do arquivo para o worker processar.
 * O processamento real (parsing, validação, persistência do histórico) é do worker.
 */
export class IngestionService {
  constructor(
    private readonly ingestion: IngestionRepository,
    private readonly publisher: JobPublisher,
  ) {}

  async start(input: {
    scenarioId: string;
    uploadedById: string;
    kind: string;
    objectUri: string;
    declaredLabels: string[];
    correlationId: string;
  }): Promise<IngestionJobRecord> {
    const job = await this.ingestion.create(input);

    const envelope = {
      messageId: randomUUID(),
      correlationId: input.correlationId,
      occurredAt: new Date().toISOString(),
      version: MESSAGING_VERSION,
      type: 'ingestion.request' as const,
      payload: {
        jobId: job.id,
        scenarioId: input.scenarioId,
        kind: input.kind,
        objectUri: input.objectUri,
        declaredLabels: input.declaredLabels,
        uploadedById: input.uploadedById,
      },
    };

    await this.publisher.publish('sop.ingestion.request.v1', envelope, input.correlationId);
    return job;
  }
}
