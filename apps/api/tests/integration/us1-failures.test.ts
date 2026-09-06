import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import type { FastifyInstance } from 'fastify';
import type {
  Authenticator,
  DatasetExporter,
  DatasetStore,
  ForecastJobRecord,
  ForecastRepository,
  IngestionIssueRecord,
  IngestionJobRecord,
  IngestionRepository,
  JobPublisher,
} from '../../src/composition/ports.js';
import { InMemoryScenarios, USER_A, fakeAuth } from '../fakes/in-memory-scenarios.js';

/**
 * T073 — Caminhos de falha do fluxo US1.
 *
 * FR-051: recusa 409 quando já há job ativo.
 * FR-005: recusa 404 para cenário inacessível.
 * HTTP 401 sem autenticação.
 */

// --- Fakes -------------------------------------------------------------------

class FakeForecastRepo implements ForecastRepository {
  private jobs: ForecastJobRecord[] = [];

  async create(input: {
    scenarioId: string;
    objectUri: string;
    horizonMonths: number;
    accuracyMetric: string;
    modelPackage: string;
    correlationId: string;
  }): Promise<ForecastJobRecord> {
    const job: ForecastJobRecord = {
      id: randomUUID(),
      scenarioId: input.scenarioId,
      status: 'PENDING',
      objectUri: input.objectUri,
      resultOutputUri: null,
      resultSeriesUri: null,
      horizonMonths: input.horizonMonths,
      accuracyMetric: input.accuracyMetric,
      modelPackage: input.modelPackage,
      createdAt: new Date().toISOString(),
      startedAt: null,
      finishedAt: null,
      failureReason: null,
    };
    this.jobs.push(job);
    return job;
  }

  async findActiveByScenario(scenarioId: string): Promise<ForecastJobRecord | null> {
    return (
      this.jobs.find(
        (j) => j.scenarioId === scenarioId && (j.status === 'PENDING' || j.status === 'PROCESSING'),
      ) ?? null
    );
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

  seedActive(scenarioId: string): ForecastJobRecord {
    const job: ForecastJobRecord = {
      id: randomUUID(),
      scenarioId,
      status: 'PROCESSING',
      objectUri: `s3://sop/forecasts/${scenarioId}/input.parquet`,
      resultOutputUri: null,
      resultSeriesUri: null,
      horizonMonths: 12,
      accuracyMetric: 'WMAPE',
      modelPackage: 'STANDARD',
      createdAt: new Date().toISOString(),
      startedAt: new Date().toISOString(),
      finishedAt: null,
      failureReason: null,
    };
    this.jobs.push(job);
    return job;
  }
}

class FakeIngestionRepo implements IngestionRepository {
  async create(): Promise<IngestionJobRecord> {
    return {
      id: randomUUID(), scenarioId: randomUUID(), kind: 'SALES_HISTORY',
      status: 'PENDING', objectUri: '', declaredLabels: [],
      totalRows: 0, validRows: 0, invalidRows: 0,
      issueCount: 0, issueCapReached: false, correlationId: randomUUID(),
      createdAt: new Date().toISOString(), startedAt: null, finishedAt: null, failureReason: null,
    };
  }
  async findById(): Promise<IngestionJobRecord | null> { return null; }
  async listIssues(): Promise<{ data: IngestionIssueRecord[]; total: number }> { return { data: [], total: 0 }; }
}

class FakePublisher implements JobPublisher {
  readonly messages: unknown[] = [];
  async publish(_q: string, payload: unknown): Promise<void> { this.messages.push(payload); }
}

class FakeDatasetStore implements DatasetStore {
  async putStream(): Promise<void> {}
  async presignGet(): Promise<string> { return 'https://fake'; }
}

class FakeDatasetExporter implements DatasetExporter {
  exported: string[] = [];
  async exportHistory(_scenarioId: string, outputUri: string): Promise<void> {
    this.exported.push(outputUri);
  }
}

// --- Setup -------------------------------------------------------------------

const SCENARIO_ID = randomUUID();
let app: FastifyInstance;
let forecastRepo: FakeForecastRepo;
let scenarios: InMemoryScenarios;

beforeAll(async () => {
  forecastRepo = new FakeForecastRepo();
  scenarios = new InMemoryScenarios();

  // Cria cenário com parametrização já salva
  const s = await scenarios.create({
    name: 'Cenário de teste',
    createdById: USER_A,
    finalSayRole: 'CREATOR',
    forecastHorizonMonths: 12,
  });
  const levels = scenarios.setLevels(s.id, ['BU', 'CD']);
  await scenarios.saveParameters(s.id, {
    groupingLevelIds: [levels[0].id],
    prorationMonths: 3,
    accuracyMetric: 'WMAPE',
    modelPackage: 'STANDARD',
    horizonMonths: 12,
  });
  // Sobrescreve o id para o fixo do teste
  (scenarios as any).scenarios.set(SCENARIO_ID, { ...(scenarios as any).scenarios.get(s.id), id: SCENARIO_ID });
  (scenarios as any).scenarios.delete(s.id);
  (scenarios as any).members.set(SCENARIO_ID, new Set([USER_A]));
  (scenarios as any).levels.set(SCENARIO_ID, (scenarios as any).levels.get(s.id) ?? []);
  (scenarios as any).params.set(SCENARIO_ID, (scenarios as any).params.get(s.id) ?? null);

  app = await buildApp({
    health: { checkDatabase: async () => true, checkBroker: async () => true, checkObjectStore: async () => true },
    auth: fakeAuth(USER_A),
    ingestion: new FakeIngestionRepo(),
    forecast: forecastRepo,
    scenarios,
    publisher: new FakePublisher(),
    datasets: new FakeDatasetStore(),
    datasetExporter: new FakeDatasetExporter(),
    logger: false,
  });
});

afterAll(async () => {
  await app.close();
});

// --- Testes ------------------------------------------------------------------

describe('POST /api/v1/scenarios/:id/forecast-jobs', () => {
  it('recusa 409 quando já existe job PENDING ou PROCESSING (FR-051)', async () => {
    // Semeia um job ativo
    forecastRepo.seedActive(SCENARIO_ID);

    const resp = await app.inject({
      method: 'POST',
      url: `/api/v1/scenarios/${SCENARIO_ID}/forecast-jobs`,
    });

    expect(resp.statusCode).toBe(409);
    const body = JSON.parse(resp.body);
    expect(body.error.code).toBe('JOB_ALREADY_ACTIVE');
  });

  it('recusa 404 para cenário inexistente', async () => {
    const resp = await app.inject({
      method: 'POST',
      url: `/api/v1/scenarios/${randomUUID()}/forecast-jobs`,
    });

    expect(resp.statusCode).toBe(404);
  });

  it('recusa 401 sem autenticação', async () => {
    const resp = await app.inject({
      method: 'POST',
      url: `/api/v1/scenarios/${SCENARIO_ID}/forecast-jobs`,
      headers: { 'x-test-user': '' },
    });

    expect(resp.statusCode).toBe(401);
  });
});
