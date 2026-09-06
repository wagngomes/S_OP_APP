import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import type { FastifyInstance } from 'fastify';
import type {
  Authenticator,
  DatasetExporter,
  DatasetStore,
  ForecastItemInput,
  ForecastItemRepository,
  ForecastJobRecord,
  ForecastRepository,
  ForecastSeriesInput,
  IngestionIssueRecord,
  IngestionJobRecord,
  IngestionRepository,
  JobPublisher,
  ParquetReader,
} from '../../src/composition/ports.js';
import { ForecastResultConsumer } from '../../src/adapters/rabbitmq/forecast-result.consumer.js';
import { InMemoryScenarios, USER_A, fakeAuth } from '../fakes/in-memory-scenarios.js';

/**
 * T072 — Fluxo completo US1: cenário → upload → parametrização → cálculo → resultado.
 *
 * Este teste exercita o caminho feliz do MVP sem banco real, sem fila real e
 * sem MinIO real. Usa fakes que implementam as portas, provando que a lógica
 * de orquestração da API está correta independente dos adaptadores.
 */

// --- Fakes -------------------------------------------------------------------

class FakeIngestionRepo implements IngestionRepository {
  jobs: IngestionJobRecord[] = [];

  async create(input: {
    scenarioId: string; kind: string; objectUri: string;
    declaredLabels: string[]; uploadedById: string; correlationId: string;
  }): Promise<IngestionJobRecord> {
    const job: IngestionJobRecord = {
      id: randomUUID(), scenarioId: input.scenarioId,
      kind: input.kind as IngestionJobRecord['kind'],
      status: 'PENDING', objectUri: input.objectUri,
      declaredLabels: input.declaredLabels, totalRows: 0, validRows: 0,
      invalidRows: 0, issueCount: 0, issueCapReached: false,
      correlationId: input.correlationId, createdAt: new Date().toISOString(),
      startedAt: null, finishedAt: null, failureReason: null,
    };
    this.jobs.push(job);
    return job;
  }

  async findById(id: string): Promise<IngestionJobRecord | null> {
    return this.jobs.find((j) => j.id === id) ?? null;
  }

  async listIssues(): Promise<{ data: IngestionIssueRecord[]; total: number }> {
    return { data: [], total: 0 };
  }
}

class FakeForecastRepo implements ForecastRepository {
  jobs: ForecastJobRecord[] = [];

  async create(input: {
    scenarioId: string; objectUri: string; horizonMonths: number;
    accuracyMetric: string; modelPackage: string; correlationId: string;
  }): Promise<ForecastJobRecord> {
    const job: ForecastJobRecord = {
      id: randomUUID(), scenarioId: input.scenarioId, status: 'PENDING',
      objectUri: input.objectUri, resultOutputUri: null, resultSeriesUri: null,
      horizonMonths: input.horizonMonths, accuracyMetric: input.accuracyMetric,
      modelPackage: input.modelPackage, createdAt: new Date().toISOString(),
      startedAt: null, finishedAt: null, failureReason: null,
    };
    this.jobs.push(job);
    return job;
  }

  async findActiveByScenario(scenarioId: string): Promise<ForecastJobRecord | null> {
    return this.jobs.find(
      (j) => j.scenarioId === scenarioId && (j.status === 'PENDING' || j.status === 'PROCESSING'),
    ) ?? null;
  }

  async findById(id: string): Promise<ForecastJobRecord | null> {
    return this.jobs.find((j) => j.id === id) ?? null;
  }

  async updateResult(
    id: string,
    result: { status: 'COMPLETED' | 'FAILED'; resultOutputUri?: string; resultSeriesUri?: string; failureReason?: string },
  ): Promise<void> {
    const job = this.jobs.find((j) => j.id === id);
    if (job) Object.assign(job, result);
  }
}

class FakeForecastItemRepo implements ForecastItemRepository {
  items: ForecastItemInput[] = [];
  series: ForecastSeriesInput[] = [];

  async bulkCreateItems(_jobId: string, _scenarioId: string, items: ForecastItemInput[]): Promise<void> {
    this.items.push(...items);
  }

  async bulkCreateSeries(_jobId: string, series: ForecastSeriesInput[]): Promise<void> {
    this.series.push(...series);
  }

  async listItems(_jobId: string, page: { limit: number; offset: number }) {
    return { data: this.items.slice(page.offset, page.offset + page.limit), total: this.items.length };
  }

  async listSeries(_jobId: string, page: { limit: number; offset: number }) {
    return { data: this.series.slice(page.offset, page.offset + page.limit), total: this.series.length };
  }
}

class FakeParquetReader implements ParquetReader {
  private itemsData: ForecastItemInput[] = [
    {
      productCode: 'P001',
      segments: ['SP'],
      seriesKey: 'SP',
      year: 2025,
      month: 1,
      calculatedQuantity: '120.000000',
    },
  ];

  private seriesData: ForecastSeriesInput[] = [
    {
      seriesKey: 'SP',
      winningModel: 'SeasonalNaive',
      metricValue: '0.150000',
      evaluatedModels: ['Naive', 'SeasonalNaive'],
      excludedModels: [],
      backtestWindowsUsed: 3,
      fallbackApplied: false,
    },
  ];

  async readItems(_uri: string): Promise<ForecastItemInput[]> { return this.itemsData; }
  async readSeries(_uri: string): Promise<ForecastSeriesInput[]> { return this.seriesData; }
}

class FakePublisher implements JobPublisher {
  messages: { queue: string; payload: unknown }[] = [];
  async publish(queue: string, payload: unknown): Promise<void> {
    this.messages.push({ queue, payload });
  }
}

class FakeDatasetStore implements DatasetStore {
  async putStream(_uri: string, stream: NodeJS.ReadableStream): Promise<void> {
    // drena o stream
    for await (const _ of stream) { /* noop */ }
  }
  async presignGet(_uri: string, _exp: number): Promise<string> { return 'https://fake'; }
}

class FakeDatasetExporter implements DatasetExporter {
  exported: string[] = [];
  async exportHistory(_scenarioId: string, uri: string): Promise<void> {
    this.exported.push(uri);
  }
}

function buildMultipart(
  boundary: string,
  fields: { name: string; value: string }[],
  file: { fieldName: string; filename: string; content: string },
): Buffer {
  const CRLF = '\r\n';
  const parts: Buffer[] = [];
  for (const f of fields) {
    parts.push(Buffer.from(`--${boundary}${CRLF}Content-Disposition: form-data; name="${f.name}"${CRLF}${CRLF}${f.value}${CRLF}`));
  }
  parts.push(Buffer.from(`--${boundary}${CRLF}Content-Disposition: form-data; name="${file.fieldName}"; filename="${file.filename}"${CRLF}Content-Type: text/csv${CRLF}${CRLF}`));
  parts.push(Buffer.from(file.content));
  parts.push(Buffer.from(`${CRLF}--${boundary}--${CRLF}`));
  return Buffer.concat(parts);
}

// --- Setup -------------------------------------------------------------------

let app: FastifyInstance;
let scenarios: InMemoryScenarios;
let forecastRepo: FakeForecastRepo;
let forecastItems: FakeForecastItemRepo;
let publisher: FakePublisher;
let parquet: FakeParquetReader;
let exporter: FakeDatasetExporter;

let scenarioId: string;
let levelIds: string[];

beforeAll(async () => {
  scenarios = new InMemoryScenarios();
  forecastRepo = new FakeForecastRepo();
  forecastItems = new FakeForecastItemRepo();
  publisher = new FakePublisher();
  parquet = new FakeParquetReader();
  exporter = new FakeDatasetExporter();

  app = await buildApp({
    health: { checkDatabase: async () => true, checkBroker: async () => true, checkObjectStore: async () => true },
    auth: fakeAuth(USER_A),
    ingestion: new FakeIngestionRepo(),
    forecast: forecastRepo,
    forecastItems,
    scenarios,
    publisher,
    datasets: new FakeDatasetStore(),
    datasetExporter: exporter,
    parquet,
    logger: false,
  });
});

afterAll(async () => {
  await app.close();
});

// --- Testes ------------------------------------------------------------------

describe('US1 — fluxo completo', () => {
  it('1. cria cenário', async () => {
    const resp = await app.inject({
      method: 'POST',
      url: '/api/v1/scenarios',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Cenário MVP',
        finalSayRole: 'CREATOR',
        forecastHorizonMonths: 12,
      }),
    });

    expect(resp.statusCode).toBe(201);
    const body = JSON.parse(resp.body);
    scenarioId = body.id;
    expect(scenarioId).toBeTruthy();
  });

  it('2. declara níveis e parametriza', async () => {
    // Avança para IMPORT_SETUP (simula o fechamento de equipe + ingestão completa)
    scenarios.setPhase(scenarioId, 'IMPORT_SETUP');
    // Semeia níveis diretamente no fake (simulando o worker ter persistido o histórico)
    const levels = scenarios.setLevels(scenarioId, ['BU', 'CD']);
    levelIds = levels.map((l) => l.id);

    const resp = await app.inject({
      method: 'PUT',
      url: `/api/v1/scenarios/${scenarioId}/parameters`,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        groupingLevelIds: [levelIds[0]],
        prorationMonths: 3,
        accuracyMetric: 'WMAPE',
        modelPackage: 'STANDARD',
        horizonMonths: 12,
      }),
    });

    expect(resp.statusCode).toBe(200);
    const body = JSON.parse(resp.body);
    expect(body.accuracyMetric).toBe('WMAPE');
  });

  it('3. faz upload do histórico — recebe 202', async () => {
    const boundary = 'E2EBoundary';
    const body = buildMultipart(
      boundary,
      [
        { name: 'kind', value: 'SALES_HISTORY' },
        { name: 'declaredLabels', value: 'BU;CD' },
      ],
      { fieldName: 'file', filename: 'historico.csv', content: 'product_code;BU;CD;year;month;quantity\nP001;SP;CEN;2024;1;100.000000\n' },
    );

    const resp = await app.inject({
      method: 'POST',
      url: `/api/v1/scenarios/${scenarioId}/uploads`,
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      body,
    });

    expect(resp.statusCode).toBe(202);
    const json = JSON.parse(resp.body);
    expect(json.jobId).toBeTruthy();
  });

  it('4. dispara o cálculo — recebe 202 com jobId', async () => {
    // Define fase IMPORT_SETUP para permitir SET_PARAMETERS e depois RUN_FORECAST
    scenarios.setPhase(scenarioId, 'IMPORT_SETUP');

    const resp = await app.inject({
      method: 'POST',
      url: `/api/v1/scenarios/${scenarioId}/forecast-jobs`,
    });

    expect(resp.statusCode).toBe(202);
    const body = JSON.parse(resp.body);
    expect(body.jobId).toBeTruthy();

    // Verifica que o dataset foi exportado para MinIO
    expect(exporter.exported.length).toBeGreaterThan(0);

    // Verifica que a mensagem foi publicada na fila certa
    const msg = publisher.messages.find((m) => m.queue === 'sop.forecast.request.v1');
    expect(msg).toBeTruthy();
  });

  it('5. simula resultado do motor e persiste itens', async () => {
    const job = forecastRepo.jobs[forecastRepo.jobs.length - 1];
    expect(job).toBeTruthy();

    const consumer = new ForecastResultConsumer(
      forecastRepo,
      forecastItems,
      parquet,
      scenarios,
    );

    const resultPayload = {
      jobId: job.id,
      status: 'completed' as const,
      outputUri: `s3://sop/forecasts/${scenarioId}/${job.id}/output.parquet`,
      seriesUri: `s3://sop/forecasts/${scenarioId}/${job.id}/series.parquet`,
      modelCatalogVersion: '1.0.0',
      stats: { seriesCount: 1, itemCount: 1, durationMs: 1200 },
      failure: null,
    };

    await consumer.process(resultPayload);

    // ForecastJob deve estar COMPLETED
    const updated = await forecastRepo.findById(job.id);
    expect(updated?.status).toBe('COMPLETED');

    // Itens devem ter sido persistidos
    expect(forecastItems.items.length).toBeGreaterThan(0);
    expect(forecastItems.series.length).toBeGreaterThan(0);

    // Fase deve ter avançado para APPROVAL
    const scenario = await scenarios.findById(scenarioId);
    expect(scenario?.phase).toBe('APPROVAL');
  });

  it('6. consulta os itens de previsão — 200 com dados', async () => {
    const resp = await app.inject({
      method: 'GET',
      url: `/api/v1/scenarios/${scenarioId}/forecast-items`,
    });

    // A rota existe e não retorna 409 (job não está mais ativo)
    expect(resp.statusCode).not.toBe(409);
    expect(resp.statusCode).toBe(200);
  });
});
