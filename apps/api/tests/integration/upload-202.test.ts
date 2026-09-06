import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import type { FastifyInstance } from 'fastify';
import type {
  Authenticator,
  DatasetStore,
  IngestionIssueRecord,
  IngestionJobRecord,
  IngestionRepository,
  JobPublisher,
  ScenarioRepository,
} from '../../src/composition/ports.js';
import { InMemoryScenarios, USER_A, fakeAuth } from '../fakes/in-memory-scenarios.js';

/**
 * T070 — Upload multipart responde 202 sem parsear conteúdo (D7).
 *
 * A API recebe o arquivo, faz streaming direto para o MinIO e devolve 202 com
 * jobId. Nenhuma linha do CSV é lida ou validada aqui — isso é trabalho do
 * worker de ingestão.
 */

// --- Fakes -------------------------------------------------------------------

class FakeDatasetStore implements DatasetStore {
  readonly uploads: { uri: string; bytes: number }[] = [];

  async putStream(uri: string, stream: NodeJS.ReadableStream): Promise<void> {
    let bytes = 0;
    for await (const chunk of stream) {
      bytes += (chunk as Buffer).length;
    }
    this.uploads.push({ uri, bytes });
  }

  async presignGet(_uri: string, _expiresInSeconds: number): Promise<string> {
    return 'https://fake-presigned-url';
  }
}

class FakeIngestionRepo implements IngestionRepository {
  readonly jobs: IngestionJobRecord[] = [];

  async create(input: {
    scenarioId: string;
    kind: string;
    objectUri: string;
    declaredLabels: string[];
    uploadedById: string;
    correlationId: string;
  }): Promise<IngestionJobRecord> {
    const job: IngestionJobRecord = {
      id: randomUUID(),
      scenarioId: input.scenarioId,
      kind: input.kind as IngestionJobRecord['kind'],
      status: 'PENDING',
      objectUri: input.objectUri,
      declaredLabels: input.declaredLabels,
      totalRows: 0,
      validRows: 0,
      invalidRows: 0,
      issueCount: 0,
      issueCapReached: false,
      correlationId: input.correlationId,
      createdAt: new Date().toISOString(),
      startedAt: null,
      finishedAt: null,
      failureReason: null,
    };
    this.jobs.push(job);
    return job;
  }

  async findById(id: string): Promise<IngestionJobRecord | null> {
    return this.jobs.find((j) => j.id === id) ?? null;
  }

  async listIssues(
    _jobId: string,
    page: { limit: number; offset: number },
  ): Promise<{ data: IngestionIssueRecord[]; total: number }> {
    return { data: [], total: 0 };
  }
}

class FakePublisher implements JobPublisher {
  readonly messages: { queue: string; payload: unknown }[] = [];

  async publish(queue: string, payload: unknown): Promise<void> {
    this.messages.push({ queue, payload });
  }
}

// --- Helpers -----------------------------------------------------------------

function buildMultipart(
  boundary: string,
  fields: { name: string; value: string }[],
  file: { fieldName: string; filename: string; content: string },
): Buffer {
  const CRLF = '\r\n';
  const parts: Buffer[] = [];

  for (const field of fields) {
    parts.push(Buffer.from(
      `--${boundary}${CRLF}` +
      `Content-Disposition: form-data; name="${field.name}"${CRLF}` +
      CRLF +
      field.value +
      CRLF,
    ));
  }

  parts.push(Buffer.from(
    `--${boundary}${CRLF}` +
    `Content-Disposition: form-data; name="${file.fieldName}"; filename="${file.filename}"${CRLF}` +
    `Content-Type: text/csv${CRLF}` +
    CRLF,
  ));
  parts.push(Buffer.from(file.content));
  parts.push(Buffer.from(CRLF));
  parts.push(Buffer.from(`--${boundary}--${CRLF}`));

  return Buffer.concat(parts);
}

// --- Setup -------------------------------------------------------------------

const SCENARIO_ID = randomUUID();
let app: FastifyInstance;
let store: FakeDatasetStore;
let ingestionRepo: FakeIngestionRepo;
let publisher: FakePublisher;
let scenarios: InMemoryScenarios;

beforeAll(async () => {
  store = new FakeDatasetStore();
  ingestionRepo = new FakeIngestionRepo();
  publisher = new FakePublisher();
  scenarios = new InMemoryScenarios();

  // Criar cenário e participação para o teste
  const s = await scenarios.create({
    name: 'Cenário de upload',
    createdById: USER_A,
    finalSayRole: 'CREATOR',
    forecastHorizonMonths: 12,
  });
  // Forçar o id para o fixo do teste
  (scenarios as any).scenarios.set(SCENARIO_ID, { ...(scenarios as any).scenarios.get(s.id), id: SCENARIO_ID });
  (scenarios as any).scenarios.delete(s.id);
  (scenarios as any).members.set(SCENARIO_ID, (scenarios as any).members.get(s.id) ?? new Set([USER_A]));

  app = await buildApp({
    health: { checkDatabase: async () => true, checkBroker: async () => true, checkObjectStore: async () => true },
    auth: fakeAuth(USER_A),
    ingestion: ingestionRepo,
    scenarios,
    publisher,
    datasets: store,
    logger: false,
  });
});

afterAll(async () => {
  await app.close();
});

// --- Testes ------------------------------------------------------------------

describe('POST /api/v1/scenarios/:id/uploads', () => {
  const boundary = 'TestBoundary12345';

  it('aceita upload e responde 202 com jobId', async () => {
    const csvContent = 'product_code;BU;year;month;quantity\nP001;SP;2024;1;100.000000\n';
    const body = buildMultipart(
      boundary,
      [
        { name: 'kind', value: 'SALES_HISTORY' },
        { name: 'declaredLabels', value: 'BU' },
      ],
      { fieldName: 'file', filename: 'historico.csv', content: csvContent },
    );

    const resp = await app.inject({
      method: 'POST',
      url: `/api/v1/scenarios/${SCENARIO_ID}/uploads`,
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      body,
    });

    expect(resp.statusCode).toBe(202);
    const json = JSON.parse(resp.body);
    expect(json).toHaveProperty('jobId');
    expect(json.jobId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('a API NÃO lê o conteúdo do CSV — apenas faz streaming (D7)', async () => {
    const initialUploads = store.uploads.length;
    const csvContent = 'coluna_invalida;totalmente_errada\nvalor;outro_valor\n';
    const body = buildMultipart(
      boundary,
      [
        { name: 'kind', value: 'SALES_HISTORY' },
        { name: 'declaredLabels', value: 'BU;CD' },
      ],
      { fieldName: 'file', filename: 'errado.csv', content: csvContent },
    );

    // A API aceita QUALQUER conteúdo no CSV — não valida linhas (D7)
    const resp = await app.inject({
      method: 'POST',
      url: `/api/v1/scenarios/${SCENARIO_ID}/uploads`,
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      body,
    });

    expect(resp.statusCode).toBe(202);
    // O arquivo deve ter chegado ao MinIO
    expect(store.uploads.length).toBeGreaterThan(initialUploads);
  });

  it('publica mensagem para o worker de ingestão', async () => {
    const initialMessages = publisher.messages.length;
    const body = buildMultipart(
      boundary,
      [
        { name: 'kind', value: 'SALES_HISTORY' },
        { name: 'declaredLabels', value: 'BU' },
      ],
      { fieldName: 'file', filename: 'dados.csv', content: 'header\nrow\n' },
    );

    await app.inject({
      method: 'POST',
      url: `/api/v1/scenarios/${SCENARIO_ID}/uploads`,
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      body,
    });

    expect(publisher.messages.length).toBeGreaterThan(initialMessages);
    const msg = publisher.messages[publisher.messages.length - 1];
    expect(msg.queue).toBe('sop.ingestion.request.v1');
  });

  it('recusa kind inválido — 400', async () => {
    const body = buildMultipart(
      boundary,
      [
        { name: 'kind', value: 'TIPO_INEXISTENTE' },
        { name: 'declaredLabels', value: 'BU' },
      ],
      { fieldName: 'file', filename: 'x.csv', content: 'x\n' },
    );

    const resp = await app.inject({
      method: 'POST',
      url: `/api/v1/scenarios/${SCENARIO_ID}/uploads`,
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      body,
    });

    expect([400, 422]).toContain(resp.statusCode);
  });

  it('requer autenticação — 401 sem header x-test-user', async () => {
    const body = buildMultipart(
      boundary,
      [
        { name: 'kind', value: 'SALES_HISTORY' },
        { name: 'declaredLabels', value: 'BU' },
      ],
      { fieldName: 'file', filename: 'x.csv', content: 'x\n' },
    );

    const resp = await app.inject({
      method: 'POST',
      url: `/api/v1/scenarios/${SCENARIO_ID}/uploads`,
      headers: {
        'content-type': `multipart/form-data; boundary=${boundary}`,
        'x-test-user': '', // força auth a retornar null
      },
      body,
    });

    expect(resp.statusCode).toBe(401);
  });
});
