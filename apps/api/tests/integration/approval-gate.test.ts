import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import type { FastifyInstance } from 'fastify';
import type {
  DatasetExporter,
  DatasetStore,
  ForecastItemRepository,
  ForecastJobRecord,
  ForecastRepository,
  ForecastSeriesInput,
  ForecastItemInput,
  IngestionIssueRecord,
  IngestionJobRecord,
  IngestionRepository,
  JobPublisher,
  NotificationPort,
  ParquetReader,
} from '../../src/composition/ports.js';
import { InMemoryMembership, InMemoryScenarios, USER_A, USER_B, fakeAuth } from '../fakes/in-memory-scenarios.js';

/**
 * T117 — Portão de aprovação.
 *
 * Colaborador não pode chamar rota de aprovação.
 * Decisão de aprovação requer role APPROVER e fase APPROVAL.
 * Devolução requer motivo (FR-056).
 */

// --- Fakes mínimas -----------------------------------------------------------

class FakeIngestionRepo implements IngestionRepository {
  async create(): Promise<IngestionJobRecord> {
    return { id: randomUUID(), scenarioId: randomUUID(), kind: 'SALES_HISTORY', status: 'PENDING', objectUri: '', declaredLabels: [], totalRows: 0, validRows: 0, invalidRows: 0, issueCount: 0, issueCapReached: false, correlationId: randomUUID(), createdAt: new Date().toISOString(), startedAt: null, finishedAt: null, failureReason: null };
  }
  async findById(): Promise<IngestionJobRecord | null> { return null; }
  async listIssues(): Promise<{ data: IngestionIssueRecord[]; total: number }> { return { data: [], total: 0 }; }
}

class FakeForecastRepo implements ForecastRepository {
  private jobs: ForecastJobRecord[] = [];
  async create(input: any): Promise<ForecastJobRecord> {
    const j: ForecastJobRecord = { id: randomUUID(), scenarioId: input.scenarioId, status: 'PENDING', objectUri: input.objectUri, resultOutputUri: null, resultSeriesUri: null, horizonMonths: input.horizonMonths, accuracyMetric: input.accuracyMetric, modelPackage: input.modelPackage, createdAt: new Date().toISOString(), startedAt: null, finishedAt: null, failureReason: null };
    this.jobs.push(j);
    return j;
  }
  async findActiveByScenario(id: string): Promise<ForecastJobRecord | null> { return this.jobs.find(j => j.scenarioId === id && (j.status === 'PENDING' || j.status === 'PROCESSING')) ?? null; }
  async findById(id: string): Promise<ForecastJobRecord | null> { return this.jobs.find(j => j.id === id) ?? null; }
  async updateResult(): Promise<void> {}
}

class FakeForecastItemRepo implements ForecastItemRepository {
  async bulkCreateItems(): Promise<void> {}
  async bulkCreateSeries(): Promise<void> {}
  async listItems(): Promise<{ data: ForecastItemInput[]; total: number }> { return { data: [], total: 0 }; }
  async listSeries(): Promise<{ data: ForecastSeriesInput[]; total: number }> { return { data: [], total: 0 }; }
}

class FakePublisher implements JobPublisher {
  async publish(): Promise<void> {}
}

class FakeDatasetStore implements DatasetStore {
  async putStream(): Promise<void> {}
  async presignGet(): Promise<string> { return 'https://fake'; }
}

class FakeDatasetExporter implements DatasetExporter {
  async exportHistory(): Promise<void> {}
}

class FakeParquetReader implements ParquetReader {
  async readItems(): Promise<ForecastItemInput[]> { return []; }
  async readSeries(): Promise<ForecastSeriesInput[]> { return []; }
}

class FakeNotification implements NotificationPort {
  readonly calls: unknown[] = [];
  async notifyForecastReady(input: unknown): Promise<void> { this.calls.push(input); }
  async notifyPhaseAdvanced(input: unknown): Promise<void> { this.calls.push(input); }
}

// --- Setup -------------------------------------------------------------------

let app: FastifyInstance;
let scenarios: InMemoryScenarios;
let membership: InMemoryMembership;
let scenarioId: string;

beforeAll(async () => {
  scenarios = new InMemoryScenarios();
  membership = new InMemoryMembership();

  const s = await scenarios.create({
    name: 'Cenário aprovação',
    createdById: USER_A,
    finalSayRole: 'CREATOR',
    forecastHorizonMonths: 12,
  });
  scenarioId = s.id;
  scenarios.setPhase(scenarioId, 'APPROVAL');
  scenarios.addMember(scenarioId, USER_B);

  membership.seedMember(scenarioId, USER_A, 'CREATOR');
  membership.seedMember(scenarioId, USER_B, 'COLLABORATOR');

  app = await buildApp({
    health: { checkDatabase: async () => true, checkBroker: async () => true, checkObjectStore: async () => true },
    auth: fakeAuth(USER_A),
    scenarios,
    membership,
    ingestion: new FakeIngestionRepo(),
    forecast: new FakeForecastRepo(),
    forecastItems: new FakeForecastItemRepo(),
    publisher: new FakePublisher(),
    datasets: new FakeDatasetStore(),
    datasetExporter: new FakeDatasetExporter(),
    parquet: new FakeParquetReader(),
    notification: new FakeNotification(),
    logger: false,
  });
});

afterAll(async () => { await app.close(); });

describe('POST /api/v1/scenarios/:id/approval-decision', () => {
  it('retorna 403 quando o usuário é COLLABORATOR (não APPROVER)', async () => {
    const resp = await app.inject({
      method: 'POST',
      url: `/api/v1/scenarios/${scenarioId}/approval-decision`,
      headers: { 'x-test-user': USER_B },
      payload: { decision: 'APPROVE' },
    });

    expect(resp.statusCode).toBe(403);
  });

  it('retorna 409 quando devolução não tem motivo (FR-056)', async () => {
    const approverUserId = randomUUID();
    scenarios.addMember(scenarioId, approverUserId);
    membership.seedMember(scenarioId, approverUserId, 'APPROVER');

    const resp = await app.inject({
      method: 'POST',
      url: `/api/v1/scenarios/${scenarioId}/approval-decision`,
      headers: { 'x-test-user': approverUserId },
      payload: { decision: 'RETURN' },
    });

    // reason é obrigatório para RETURN
    expect(resp.statusCode).toBe(409);
    const body = JSON.parse(resp.body);
    expect(body.error.code).toBe('REASON_REQUIRED');
  });

  it('retorna 204 quando APPROVER aprova na fase APPROVAL', async () => {
    const approverUserId = randomUUID();
    scenarios.addMember(scenarioId, approverUserId);
    membership.seedMember(scenarioId, approverUserId, 'APPROVER');
    // Garante que a fase ainda é APPROVAL (pode ter sido alterada no teste anterior)
    scenarios.setPhase(scenarioId, 'APPROVAL');

    const resp = await app.inject({
      method: 'POST',
      url: `/api/v1/scenarios/${scenarioId}/approval-decision`,
      headers: { 'x-test-user': approverUserId },
      payload: { decision: 'APPROVE' },
    });

    expect(resp.statusCode).toBe(204);
  });
});
