import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import type { FastifyInstance } from 'fastify';
import type {
  ConsensusDecisionRecord,
  ConsensusItemRecord,
  ConsensusRepository,
  DatasetStore,
  PublishedForecastRecord,
} from '../../src/composition/ports.js';
import { InMemoryMembership, InMemoryScenarios, USER_A, USER_B, fakeAuth } from '../fakes/in-memory-scenarios.js';

/**
 * T144 — FR-071: apenas o `finalSayRole` pode registrar decisões no consenso.
 */

// --- In-memory ConsensusRepository -------------------------------------------

class InMemoryConsensusRepo implements ConsensusRepository {
  items: ConsensusItemRecord[] = [];
  decisions: Map<string, ConsensusDecisionRecord> = new Map();

  async listItemsForConsensus(
    _scenarioId: string,
    page: { limit: number; offset: number },
  ): Promise<{ data: ConsensusItemRecord[]; total: number }> {
    return {
      data: this.items.slice(page.offset, page.offset + page.limit),
      total: this.items.length,
    };
  }

  async createDecision(input: {
    forecastItemId: string;
    decidedById: string;
    source: 'CALCULATED' | 'COLLABORATED' | 'MANUAL';
    quantity: string;
    reason?: string;
  }): Promise<ConsensusDecisionRecord> {
    const record: ConsensusDecisionRecord = {
      id: randomUUID(),
      forecastItemId: input.forecastItemId,
      decidedById: input.decidedById,
      source: input.source,
      quantity: input.quantity,
      reason: input.reason ?? null,
      decidedAt: new Date().toISOString(),
    };
    this.decisions.set(input.forecastItemId, record);
    return record;
  }

  async allItemsDecided(_scenarioId: string): Promise<boolean> {
    return this.items.every((i) => this.decisions.has(i.id));
  }

  async publishForecast(_scenarioId: string): Promise<void> {}

  async listPublished(
    _scenarioId: string,
    _page: { limit: number; offset: number },
  ): Promise<{ data: PublishedForecastRecord[]; total: number }> {
    return { data: [], total: 0 };
  }

  seedItem(item: ConsensusItemRecord): void {
    this.items.push(item);
  }
}

class FakeDatasetStore implements DatasetStore {
  async putStream(): Promise<void> {}
  async presignGet(): Promise<string> { return 'https://fake'; }
}

// --- Setup -------------------------------------------------------------------

const APPROVER_USER = randomUUID();

let app: FastifyInstance;
let scenarios: InMemoryScenarios;
let membership: InMemoryMembership;
let consensusRepo: InMemoryConsensusRepo;
let scenarioId: string;
let itemId: string;

beforeAll(async () => {
  scenarios = new InMemoryScenarios();
  membership = new InMemoryMembership();
  consensusRepo = new InMemoryConsensusRepo();

  const s = await scenarios.create({
    name: 'Cenário consenso',
    createdById: USER_A,
    finalSayRole: 'APPROVER', // o APPROVER é quem decide
    forecastHorizonMonths: 12,
  });
  scenarioId = s.id;
  scenarios.setPhase(scenarioId, 'CONSENSUS');
  scenarios.addMember(scenarioId, USER_B);
  scenarios.addMember(scenarioId, APPROVER_USER);

  membership.seedMember(scenarioId, USER_A, 'CREATOR');
  membership.seedMember(scenarioId, USER_B, 'COLLABORATOR');
  membership.seedMember(scenarioId, APPROVER_USER, 'APPROVER');

  itemId = randomUUID();
  consensusRepo.seedItem({
    id: itemId,
    productCode: 'PROD-001',
    segments: [],
    year: 2025,
    month: 1,
    calculatedQuantity: '100.000000',
    collaboratedQuantity: '110.000000',
    currentDecision: null,
  });

  app = await buildApp({
    health: { checkDatabase: async () => true, checkBroker: async () => true, checkObjectStore: async () => true },
    auth: fakeAuth(USER_A),
    scenarios,
    membership,
    consensus: consensusRepo,
    datasets: new FakeDatasetStore(),
    logger: false,
  });
});

afterAll(async () => { await app?.close(); });

// --- Testes ------------------------------------------------------------------

describe('POST /api/v1/scenarios/:id/consensus/decisions — autorização (FR-071)', () => {
  it('retorna 403 quando CREATOR tenta decidir em cenário finalSayRole=APPROVER', async () => {
    const resp = await app.inject({
      method: 'POST',
      url: `/api/v1/scenarios/${scenarioId}/consensus/decisions`,
      headers: { 'x-test-user': USER_A },
      payload: { forecastItemId: itemId, source: 'CALCULATED', quantity: '100.000000' },
    });
    expect(resp.statusCode).toBe(403);
  });

  it('retorna 403 quando COLLABORATOR tenta decidir', async () => {
    const resp = await app.inject({
      method: 'POST',
      url: `/api/v1/scenarios/${scenarioId}/consensus/decisions`,
      headers: { 'x-test-user': USER_B },
      payload: { forecastItemId: itemId, source: 'CALCULATED', quantity: '100.000000' },
    });
    expect(resp.statusCode).toBe(403);
  });

  it('retorna 409 quando cenário não está em CONSENSUS', async () => {
    scenarios.setPhase(scenarioId, 'COLLABORATION');

    const resp = await app.inject({
      method: 'POST',
      url: `/api/v1/scenarios/${scenarioId}/consensus/decisions`,
      headers: { 'x-test-user': APPROVER_USER },
      payload: { forecastItemId: itemId, source: 'CALCULATED', quantity: '100.000000' },
    });
    expect(resp.statusCode).toBe(409);

    scenarios.setPhase(scenarioId, 'CONSENSUS');
  });

  it('retorna 200 quando APPROVER decide em cenário finalSayRole=APPROVER', async () => {
    const resp = await app.inject({
      method: 'POST',
      url: `/api/v1/scenarios/${scenarioId}/consensus/decisions`,
      headers: { 'x-test-user': APPROVER_USER },
      payload: { forecastItemId: itemId, source: 'CALCULATED', quantity: '100.000000' },
    });
    expect(resp.statusCode).toBe(200);
    const body = JSON.parse(resp.body);
    expect(body.source).toBe('CALCULATED');
  });
});
