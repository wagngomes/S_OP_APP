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
import { InMemoryMembership, InMemoryScenarios, USER_A, fakeAuth } from '../fakes/in-memory-scenarios.js';

/**
 * T145 — FR-073: publicação recusada quando há itens sem decisão.
 */

// --- In-memory ConsensusRepository -------------------------------------------

class InMemoryConsensusRepo implements ConsensusRepository {
  private readonly decisions = new Map<string, ConsensusDecisionRecord>();
  private _allDecided = false;
  published = false;

  setAllDecided(v: boolean): void { this._allDecided = v; }

  async listItemsForConsensus(_: string, __: { limit: number; offset: number }) {
    return { data: [] as ConsensusItemRecord[], total: 0 };
  }

  async createDecision(input: {
    forecastItemId: string;
    decidedById: string;
    source: 'CALCULATED' | 'COLLABORATED' | 'MANUAL';
    quantity: string;
    reason?: string;
  }): Promise<ConsensusDecisionRecord> {
    const r: ConsensusDecisionRecord = {
      id: randomUUID(),
      forecastItemId: input.forecastItemId,
      decidedById: input.decidedById,
      source: input.source,
      quantity: input.quantity,
      reason: input.reason ?? null,
      decidedAt: new Date().toISOString(),
    };
    this.decisions.set(input.forecastItemId, r);
    return r;
  }

  async allItemsDecided(_scenarioId: string): Promise<boolean> {
    return this._allDecided;
  }

  async publishForecast(_scenarioId: string): Promise<void> {
    this.published = true;
  }

  async listPublished(
    _: string,
    __: { limit: number; offset: number },
  ): Promise<{ data: PublishedForecastRecord[]; total: number }> {
    return { data: [], total: 0 };
  }
}

class FakeDatasetStore implements DatasetStore {
  async putStream(): Promise<void> {}
  async presignGet(): Promise<string> { return 'https://fake'; }
}

// --- Setup -------------------------------------------------------------------

let app: FastifyInstance;
let scenarios: InMemoryScenarios;
let consensusRepo: InMemoryConsensusRepo;
let scenarioId: string;

beforeAll(async () => {
  scenarios = new InMemoryScenarios();
  const membership = new InMemoryMembership();
  consensusRepo = new InMemoryConsensusRepo();

  const s = await scenarios.create({
    name: 'Cenário publicação',
    createdById: USER_A,
    finalSayRole: 'CREATOR',
    forecastHorizonMonths: 12,
  });
  scenarioId = s.id;
  scenarios.setPhase(scenarioId, 'CONSENSUS');

  membership.seedMember(scenarioId, USER_A, 'CREATOR');

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

describe('POST /api/v1/scenarios/:id/publication — portão de publicação (FR-073)', () => {
  it('retorna 409 UNDECIDED_ITEMS quando há itens sem decisão', async () => {
    consensusRepo.setAllDecided(false);

    const resp = await app.inject({
      method: 'POST',
      url: `/api/v1/scenarios/${scenarioId}/publication`,
    });

    expect(resp.statusCode).toBe(409);
    const body = JSON.parse(resp.body);
    expect(body.error.code).toBe('UNDECIDED_ITEMS');
    expect(consensusRepo.published).toBe(false);
  });

  it('publica e transita para PUBLICATION quando todos os itens têm decisão', async () => {
    consensusRepo.setAllDecided(true);
    scenarios.setPhase(scenarioId, 'CONSENSUS');

    const resp = await app.inject({
      method: 'POST',
      url: `/api/v1/scenarios/${scenarioId}/publication`,
    });

    expect(resp.statusCode).toBe(204);
    expect(consensusRepo.published).toBe(true);
    expect((await scenarios.findById(scenarioId))?.phase).toBe('PUBLICATION');
  });
});
