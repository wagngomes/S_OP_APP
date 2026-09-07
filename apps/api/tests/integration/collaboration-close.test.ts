import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import type { FastifyInstance } from 'fastify';
import type {
  CollaborationAdjustmentRecord,
  CollaborationItemRecord,
  CollaborationRepository,
  DatasetStore,
} from '../../src/composition/ports.js';
import { InMemoryMembership, InMemoryScenarios, USER_A, fakeAuth } from '../fakes/in-memory-scenarios.js';

/**
 * T132 — FR-063 / FR-064: colaboradores sinalizam conclusão; encerramento automático.
 *
 * Quando todos os COLLABORATORs chamam POST /done, o cenário deve transitar
 * automaticamente de COLLABORATION para CONSENSUS.
 */

// --- In-memory CollaborationRepository ---

class InMemoryCollaborationRepo implements CollaborationRepository {
  private readonly doneSet = new Set<string>(); // `${scenarioId}:${userId}`
  private readonly collaborators = new Map<string, string[]>();

  async createAdjustment(input: {
    scenarioId: string;
    forecastItemId: string;
    authorId: string;
    quantity: string;
    reason: string;
    origin: 'UI' | 'SPREADSHEET';
  }): Promise<CollaborationAdjustmentRecord> {
    return {
      id: randomUUID(),
      scenarioId: input.scenarioId,
      forecastItemId: input.forecastItemId,
      authorId: input.authorId,
      quantity: input.quantity,
      reason: input.reason,
      origin: input.origin,
      supersededById: null,
      createdAt: new Date().toISOString(),
    };
  }

  async listItemsWithAdjustments(
    _scenarioId: string,
    _page: { limit: number; offset: number },
  ): Promise<{ data: CollaborationItemRecord[]; total: number }> {
    return { data: [], total: 0 };
  }

  async findForecastItem(_id: string): Promise<{ id: string; scenarioId: string } | null> {
    return null;
  }

  async versionFor(_forecastItemId: string): Promise<number> {
    return 0;
  }

  async markDone(scenarioId: string, userId: string): Promise<void> {
    this.doneSet.add(`${scenarioId}:${userId}`);
  }

  async allCollaboratorsDone(scenarioId: string): Promise<boolean> {
    const ids = this.collaborators.get(scenarioId) ?? [];
    return ids.length > 0 && ids.every((uid) => this.doneSet.has(`${scenarioId}:${uid}`));
  }

  async pendingCollaborators(_scenarioId: string): Promise<{ userId: string | null; invitedEmail: string }[]> {
    return [];
  }

  seedCollaborators(scenarioId: string, userIds: string[]): void {
    this.collaborators.set(scenarioId, userIds);
  }
}

class FakeDatasetStore implements DatasetStore {
  async putStream(): Promise<void> {}
  async presignGet(): Promise<string> { return 'https://fake'; }
}

// --- Setup -------------------------------------------------------------------

const COLLAB_A = randomUUID();
const COLLAB_B = randomUUID();

let app: FastifyInstance;
let scenarios: InMemoryScenarios;
let collab: InMemoryCollaborationRepo;
let scenarioId: string;

beforeAll(async () => {
  scenarios = new InMemoryScenarios();
  const membership = new InMemoryMembership();
  collab = new InMemoryCollaborationRepo();

  const s = await scenarios.create({
    name: 'Cenário colaboração',
    createdById: USER_A,
    finalSayRole: 'CREATOR',
    forecastHorizonMonths: 12,
  });
  scenarioId = s.id;
  scenarios.setPhase(scenarioId, 'COLLABORATION');
  scenarios.addMember(scenarioId, COLLAB_A);
  scenarios.addMember(scenarioId, COLLAB_B);

  membership.seedMember(scenarioId, USER_A, 'CREATOR');
  membership.seedMember(scenarioId, COLLAB_A, 'COLLABORATOR');
  membership.seedMember(scenarioId, COLLAB_B, 'COLLABORATOR');

  collab.seedCollaborators(scenarioId, [COLLAB_A, COLLAB_B]);

  app = await buildApp({
    health: { checkDatabase: async () => true, checkBroker: async () => true, checkObjectStore: async () => true },
    // fakeAuth com USER_A como default; testes sobrescrevem com x-test-user
    auth: fakeAuth(USER_A),
    scenarios,
    membership,
    collaboration: collab,
    datasets: new FakeDatasetStore(),
    logger: false,
  });
});

afterAll(async () => { await app?.close(); });

// --- Testes ------------------------------------------------------------------

describe('POST /api/v1/scenarios/:id/collaboration/done — auto-close (FR-063, FR-064)', () => {
  it('retorna 403 quando o usuário é CREATOR (não COLLABORATOR)', async () => {
    const resp = await app.inject({
      method: 'POST',
      url: `/api/v1/scenarios/${scenarioId}/collaboration/done`,
      headers: { 'x-test-user': USER_A },
    });

    expect(resp.statusCode).toBe(403);
  });

  it('retorna 409 quando o cenário não está em COLLABORATION', async () => {
    // Guarda fase original
    scenarios.setPhase(scenarioId, 'CONSENSUS');

    const resp = await app.inject({
      method: 'POST',
      url: `/api/v1/scenarios/${scenarioId}/collaboration/done`,
      headers: { 'x-test-user': COLLAB_A },
    });

    expect(resp.statusCode).toBe(409);

    // Restaura
    scenarios.setPhase(scenarioId, 'COLLABORATION');
  });

  it('transita para CONSENSUS automaticamente quando todos os colaboradores concluem (FR-064)', async () => {
    scenarios.setPhase(scenarioId, 'COLLABORATION');

    // Colaborador A sinaliza conclusão
    const respA = await app.inject({
      method: 'POST',
      url: `/api/v1/scenarios/${scenarioId}/collaboration/done`,
      headers: { 'x-test-user': COLLAB_A },
    });
    expect(respA.statusCode).toBe(204);

    // Cenário ainda em COLLABORATION (B não concluiu)
    expect((await scenarios.findById(scenarioId))?.phase).toBe('COLLABORATION');

    // Colaborador B sinaliza conclusão
    const respB = await app.inject({
      method: 'POST',
      url: `/api/v1/scenarios/${scenarioId}/collaboration/done`,
      headers: { 'x-test-user': COLLAB_B },
    });
    expect(respB.statusCode).toBe(204);

    // Cenário deve ter transitado para CONSENSUS
    expect((await scenarios.findById(scenarioId))?.phase).toBe('CONSENSUS');
  });
});

describe('POST /api/v1/scenarios/:id/collaboration/close — encerramento pelo criador (FR-065)', () => {
  it('retorna 403 quando o usuário não é CREATOR', async () => {
    scenarios.setPhase(scenarioId, 'COLLABORATION');

    const resp = await app.inject({
      method: 'POST',
      url: `/api/v1/scenarios/${scenarioId}/collaboration/close`,
      headers: { 'x-test-user': COLLAB_A },
    });

    expect(resp.statusCode).toBe(403);
  });

  it('transita para CONSENSUS mesmo com colaboradores pendentes', async () => {
    scenarios.setPhase(scenarioId, 'COLLABORATION');

    const resp = await app.inject({
      method: 'POST',
      url: `/api/v1/scenarios/${scenarioId}/collaboration/close`,
      headers: { 'x-test-user': USER_A },
    });

    expect(resp.statusCode).toBe(204);
    expect((await scenarios.findById(scenarioId))?.phase).toBe('CONSENSUS');
  });
});
