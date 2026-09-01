import { randomUUID } from 'node:crypto';
import type {
  Authenticator,
  HistoryStats,
  ParametersRecord,
  ScenarioRecord,
  ScenarioRepository,
  SegmentationLevelRecord,
} from '../../src/composition/ports.js';

/**
 * Implementações em memória das portas.
 *
 * Não são "mocks" no sentido de dublês frouxos: reproduzem o contrato da porta,
 * inclusive as regras de acesso. É o que permite testar service e rota de ponta a
 * ponta sem Postgres — o Princípio IV pagando na prática.
 */

export const USER_A = '018f0000-0000-7000-8000-00000000000a';
export const USER_B = '018f0000-0000-7000-8000-00000000000b';

export function fakeAuth(userId: string | null = USER_A): Authenticator {
  return {
    async currentUser(headers) {
      const override = headers['x-test-user'];
      const id = typeof override === 'string' ? override : userId;
      return id ? { id } : null;
    },
  };
}

export class InMemoryScenarios implements ScenarioRepository {
  private readonly scenarios = new Map<string, ScenarioRecord>();
  private readonly members = new Map<string, Set<string>>();
  private readonly levels = new Map<string, SegmentationLevelRecord[]>();
  private readonly params = new Map<string, ParametersRecord>();
  private readonly stats = new Map<string, HistoryStats>();
  private readonly seriesCounts = new Map<string, number>();

  async create(input: {
    name: string;
    createdById: string;
    finalSayRole: 'CREATOR' | 'APPROVER';
    forecastHorizonMonths: number;
  }): Promise<ScenarioRecord> {
    const record: ScenarioRecord = {
      id: randomUUID(),
      name: input.name,
      phase: 'TEAM_SETUP',
      createdById: input.createdById,
      finalSayRole: input.finalSayRole,
      teamClosedAt: null,
      forecastHorizonMonths: input.forecastHorizonMonths,
      publishedAt: null,
      createdAt: new Date().toISOString(),
    };
    this.scenarios.set(record.id, record);
    this.members.set(record.id, new Set([input.createdById]));
    return record;
  }

  async findById(id: string): Promise<ScenarioRecord | null> {
    return this.scenarios.get(id) ?? null;
  }

  async isMember(scenarioId: string, userId: string): Promise<boolean> {
    return this.members.get(scenarioId)?.has(userId) ?? false;
  }

  async listForUser(userId: string, page: { limit: number; offset: number }) {
    const all = [...this.scenarios.values()].filter((s) =>
      this.members.get(s.id)?.has(userId),
    );
    return { data: all.slice(page.offset, page.offset + page.limit), total: all.length };
  }

  async listLevels(scenarioId: string): Promise<SegmentationLevelRecord[]> {
    return this.levels.get(scenarioId) ?? [];
  }

  async getParameters(scenarioId: string): Promise<ParametersRecord | null> {
    return this.params.get(scenarioId) ?? null;
  }

  async saveParameters(scenarioId: string, params: ParametersRecord): Promise<void> {
    this.params.set(scenarioId, params);
  }

  async historyStats(scenarioId: string): Promise<HistoryStats> {
    return this.stats.get(scenarioId) ?? { availableHistoryMonths: 24, zeroMonthProportion: 0.05 };
  }

  async countDistinctSeries(scenarioId: string, levelIds: string[]): Promise<number> {
    const key = `${scenarioId}:${[...levelIds].sort().join(',')}`;
    if (this.seriesCounts.has(key)) return this.seriesCounts.get(key)!;
    // Sem valor semeado: cresce com o número de níveis, imitando o comportamento
    // real de uma combinação mais granular gerar mais séries.
    return Math.max(1, 10 ** levelIds.length);
  }

  // --- utilidades de teste ---------------------------------------------------

  setPhase(scenarioId: string, phase: ScenarioRecord['phase']): void {
    const s = this.scenarios.get(scenarioId);
    if (s) this.scenarios.set(scenarioId, { ...s, phase });
  }

  setLevels(scenarioId: string, labels: string[]): SegmentationLevelRecord[] {
    const levels = labels.map((label, position) => ({ id: randomUUID(), position, label }));
    this.levels.set(scenarioId, levels);
    return levels;
  }

  setStats(scenarioId: string, stats: HistoryStats): void {
    this.stats.set(scenarioId, stats);
  }

  setSeriesCount(scenarioId: string, levelIds: string[], count: number): void {
    this.seriesCounts.set(`${scenarioId}:${[...levelIds].sort().join(',')}`, count);
  }

  addMember(scenarioId: string, userId: string): void {
    this.members.get(scenarioId)?.add(userId);
  }
}
