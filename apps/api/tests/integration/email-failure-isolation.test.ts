import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import type { FastifyInstance } from 'fastify';
import type { NotificationPort } from '../../src/composition/ports.js';
import { InMemoryMembership, InMemoryScenarios, USER_A, fakeAuth } from '../fakes/in-memory-scenarios.js';

/**
 * T155 — FR-096: falha de e-mail NÃO desfaz avanço de fase.
 *
 * A transição de fase é confirmada antes de a notificação ser tentada.
 * Um port que lança não deve causar HTTP 500 nem reverter a fase.
 */

class ThrowingNotificationPort implements NotificationPort {
  called = false;

  async notifyForecastReady(): Promise<void> {}

  async notifyPhaseAdvanced(): Promise<void> {
    this.called = true;
    throw new Error('SMTP timeout simulado');
  }
}

let app: FastifyInstance;
let scenarios: InMemoryScenarios;
let membership: InMemoryMembership;
let scenarioId: string;
const approverUserId = randomUUID();
let notifPort: ThrowingNotificationPort;

beforeAll(async () => {
  scenarios = new InMemoryScenarios();
  membership = new InMemoryMembership();

  const s = await scenarios.create({
    name: 'Cenário isolamento',
    createdById: USER_A,
    finalSayRole: 'CREATOR',
    forecastHorizonMonths: 12,
  });
  scenarioId = s.id;
  scenarios.setPhase(scenarioId, 'APPROVAL');

  // APPROVER faz a decisão; COLLABORATOR é o destinatário da notificação
  scenarios.addMember(scenarioId, approverUserId);
  membership.seedMember(scenarioId, USER_A, 'CREATOR');
  membership.seedMember(scenarioId, approverUserId, 'APPROVER');
  membership.seedMember(scenarioId, randomUUID(), 'COLLABORATOR');

  notifPort = new ThrowingNotificationPort();

  app = await buildApp({
    health: { checkDatabase: async () => true, checkBroker: async () => true, checkObjectStore: async () => true },
    auth: fakeAuth(approverUserId),
    scenarios,
    membership,
    notification: notifPort,
    logger: false,
  });
});

afterAll(async () => { await app.close(); });

describe('POST /api/v1/scenarios/:id/approval-decision — isolamento de falha (FR-096)', () => {
  it('retorna 204 mesmo quando notifyPhaseAdvanced lança', async () => {
    const resp = await app.inject({
      method: 'POST',
      url: `/api/v1/scenarios/${scenarioId}/approval-decision`,
      headers: { 'x-test-user': approverUserId },
      payload: { decision: 'APPROVE' },
    });

    expect(resp.statusCode).toBe(204);
  });

  it('a fase avançou para COLLABORATION apesar da falha de notificação', async () => {
    const s = await scenarios.findById(scenarioId);
    expect(s?.phase).toBe('COLLABORATION');
  });

  it('a notificação foi tentada (port foi chamado)', () => {
    expect(notifPort.called).toBe(true);
  });
});
