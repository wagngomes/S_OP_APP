import { randomUUID } from 'node:crypto';
import { IngestionKind, ScenarioIdParam, UploadAcceptedResponse } from '@sop/contracts';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type {
  Authenticator,
  DatasetStore,
  IngestionRepository,
  JobPublisher,
} from '../../composition/ports.js';
import { AppError } from '../../middleware/error-handler.js';
import { IngestionService } from '../../services/ingestion.service.js';

/**
 * Rota de upload multipart em streaming (T096, D7).
 *
 * A API não parseia o conteúdo do arquivo — apenas o encaminha para o MinIO.
 * Toda validação de linha acontece no worker de ingestão, assincronamente.
 *
 * Campos esperados no multipart (na ordem — texto antes do arquivo):
 *   - `kind`: IngestionKind
 *   - `declaredLabels`: rótulos separados por ponto-e-vírgula (ex.: "BU;CD")
 *   - `file`: o arquivo CSV (pode ser grande)
 */
export function registerUploadRoutes(
  app: FastifyInstance,
  deps: {
    auth: Authenticator;
    ingestion: IngestionRepository;
    publisher: JobPublisher;
    datasets: DatasetStore;
  },
): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const service = new IngestionService(deps.ingestion, deps.publisher);

  async function requireUser(request: FastifyRequest): Promise<{ id: string }> {
    const user = await deps.auth.currentUser(request.headers);
    if (!user) {
      throw new AppError(401, 'UNAUTHENTICATED', 'autentique-se para acessar este recurso');
    }
    return user;
  }

  typed.post(
    '/scenarios/:id/uploads',
    {
      schema: {
        summary: 'Upload multipart de arquivo em streaming para o MinIO',
        description: [
          'D7 — o request não parseia conteúdo; todo o CSV vai direto para o MinIO.',
          'FR-021 — os rótulos declarados são validados no worker, não aqui.',
          'Responde 202 com o jobId para polling de status.',
        ].join(' '),
        params: ScenarioIdParam,
        response: { 202: UploadAcceptedResponse },
      },
    },
    async (request, reply) => {
      const user = await requireUser(request);
      const scenarioId = (request.params as { id: string }).id;

      const correlationId = request.id;

      let kind: string | undefined;
      let declaredLabels: string[] = [];
      let jobId: string | undefined;

      try {
        const parts = request.parts();
        for await (const part of parts) {
          if (part.type === 'field') {
            if (part.fieldname === 'kind') {
              kind = part.value as string;
            } else if (part.fieldname === 'declaredLabels') {
              const raw = part.value as string;
              declaredLabels = raw.split(';').map((s) => s.trim()).filter(Boolean);
            }
          } else if (part.type === 'file' && part.fieldname === 'file') {
            // Validar kind antes de aceitar o arquivo
            const parsed = IngestionKind.safeParse(kind);
            if (!parsed.success) {
              await part.toBuffer(); // drena o stream para não deixar conexão pendurada
              throw new AppError(400, 'VALIDATION_FAILED', `kind inválido: ${kind}`);
            }

            jobId = randomUUID();
            const objectUri = `s3://sop/uploads/${scenarioId}/${jobId}/original.csv`;

            // Streaming direto para o MinIO — nenhum byte é bufferizado na API
            await deps.datasets.putStream(objectUri, part.file);

            // Cria o IngestionJob e publica para o worker
            await service.start({
              scenarioId,
              uploadedById: user.id,
              kind: parsed.data,
              objectUri,
              declaredLabels,
              correlationId,
            });
          }
        }
      } catch (err) {
        if (err instanceof AppError) throw err;
        throw new AppError(500, 'INTERNAL', 'falha no upload');
      }

      if (!jobId) {
        throw new AppError(400, 'VALIDATION_FAILED', 'campo `file` ausente no multipart');
      }

      return reply.status(202).send({ jobId });
    },
  );
}
