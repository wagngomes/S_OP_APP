import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import type { FastifyInstance } from 'fastify';
import { InMemoryMembership, InMemoryScenarios, USER_A, USER_B, fakeAuth } from '../fakes/in-memory-scenarios.js';

/**
 * T116 — Caminhos de falha do fechamento de equipe.
 *
 * FR-015: fechar equipe sem aprovador retorna 409.
 * FR-003: somente criador pode fechar a equipe.
 */

let app: FastifyInstance;
let scenarios: InMemoryScenarios;
let membership: InMemoryMembership;
let scenarioId: string;

beforeAll(async () => {
  scenarios = new InMemoryScenarios();
  membership = new InMemoryMembership();

  const s = await scenarios.create({
    name: 'Equipe sem aprovador',
    createdById: USER_A,
    finalSayRole: 'CREATOR',
    forecastHorizonMonths: 12,
  });
  scenarioId = s.id;
  // Criador já é membro da lista de auth (InMemoryScenarios) mas precisa
  // estar no InMemoryMembership com role CREATOR para canPerform funcionar.
  membership.seedMember(scenarioId, USER_A, 'CREATOR');

  app = await buildApp({
    health: { checkDatabase: async () => true, checkBroker: async () => true, checkObjectStore: async () => true },
    auth: fakeAuth(USER_A),
    scenarios,
    membership,
    logger: false,
  });
});

afterAll(async () => { await app.close(); });

describe('POST /api/v1/scenarios/:id/close-team', () => {
  it('retorna 409 quando não há membro com papel APPROVER (FR-015)', async () => {
    const resp = await app.inject({
      method: 'POST',
      url: `/api/v1/scenarios/${scenarioId}/close-team`,
    });

    expect(resp.statusCode).toBe(409);
    const body = JSON.parse(resp.body);
    expect(body.error.code).toBe('APPROVER_REQUIRED');
  });

  it('retorna 403 quando chamado por não-criador', async () => {
    // USER_B é membro de auth mas não tem CREATOR no membership
    scenarios.addMember(scenarioId, USER_B);
    membership.seedMember(scenarioId, USER_B, 'COLLABORATOR');

    const resp = await app.inject({
      method: 'POST',
      url: `/api/v1/scenarios/${scenarioId}/close-team`,
      headers: { 'x-test-user': USER_B },
    });

    expect(resp.statusCode).toBe(403);
  });

  it('retorna 204 quando há aprovador (caminho feliz)', async () => {
    membership.seedMember(scenarioId, randomUUID(), 'APPROVER');

    const resp = await app.inject({
      method: 'POST',
      url: `/api/v1/scenarios/${scenarioId}/close-team`,
    });

    expect(resp.statusCode).toBe(204);
  });
});
