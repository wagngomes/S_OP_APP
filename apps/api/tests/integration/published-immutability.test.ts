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
 * T146 — FR-076: a previsão publicada é somente leitura.
 *
 * Após publicação (fase PUBLICATION), tentativas de registrar novas decisões de
 * consenso devem ser recusadas com 409 PHASE_NOT_ALLOWED.
 */

class StubConsensusRepo implements ConsensusRepository {
  async listItemsForConsensus(_: string, __: any) { return { data: [] as ConsensusItemRecord[], total: 0 }; }
  async createDecision(input: any): Promise<ConsensusDecisionRecord> {
    return { id: randomUUID(), forecastItemId: input.forecastItemId, decidedById: input.decidedById, source: input.source, quantity: input.quantity, reason: null, decidedAt: new Date().toISOString() };
  }
  async allItemsDecided(_: string): Promise<boolean> { return true; }
  async publishForecast(_: string): Promise<void> {}
  async listPublished(
    _: string,
    page: { limit: number; offset: number },
  ): Promise<{ data: PublishedForecastRecord[]; total: number }> {
    return {
      data: [{
        id: randomUUID(),
        forecastItemId: randomUUID(),
        productCode: 'PROD-001',
        segments: [],
        year: 2025,
        month: 1,
        quantity: '100.000000',
        publishedAt: new Date().toISOString(),
      }],
      total: 1,
    };
  }
}

class FakeDatasetStore implements DatasetStore {
  async putStream(): Promise<void> {}
  async presignGet(): Promise<string> { return 'https://fake'; }
}

let app: FastifyInstance;
let scenarios: InMemoryScenarios;
let scenarioId: string;

beforeAll(async () => {
  scenarios = new InMemoryScenarios();
  const membership = new InMemoryMembership();

  const s = await scenarios.create({
    name: 'Cenário publicado',
    createdById: USER_A,
    finalSayRole: 'CREATOR',
    forecastHorizonMonths: 12,
  });
  scenarioId = s.id;
  scenarios.setPhase(scenarioId, 'PUBLICATION');

  membership.seedMember(scenarioId, USER_A, 'CREATOR');

  app = await buildApp({
    health: { checkDatabase: async () => true, checkBroker: async () => true, checkObjectStore: async () => true },
    auth: fakeAuth(USER_A),
    scenarios,
    membership,
    consensus: new StubConsensusRepo(),
    datasets: new FakeDatasetStore(),
    logger: false,
  });
});

afterAll(async () => { await app?.close(); });

describe('FR-076 — imutabilidade do publicado', () => {
  it('recusa POST /consensus/decisions na fase PUBLICATION com 409', async () => {
    const resp = await app.inject({
      method: 'POST',
      url: `/api/v1/scenarios/${scenarioId}/consensus/decisions`,
      payload: { forecastItemId: randomUUID(), source: 'CALCULATED', quantity: '100.000000' },
    });
    expect(resp.statusCode).toBe(409);
  });

  it('retorna 409 em POST /publication quando já está em PUBLICATION', async () => {
    const resp = await app.inject({
      method: 'POST',
      url: `/api/v1/scenarios/${scenarioId}/publication`,
    });
    expect(resp.statusCode).toBe(409);
  });

  it('GET /published-forecast retorna 200 com os itens publicados', async () => {
    const resp = await app.inject({
      method: 'GET',
      url: `/api/v1/scenarios/${scenarioId}/published-forecast`,
    });
    expect(resp.statusCode).toBe(200);
    const body = JSON.parse(resp.body);
    expect(body.total).toBe(1);
    expect(body.data[0].productCode).toBe('PROD-001');
  });
});
