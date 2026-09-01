import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { InMemoryScenarios, USER_A, USER_B, fakeAuth } from '../fakes/in-memory-scenarios.js';

/**
 * Rotas de cenário e parametrização, exercitadas de ponta a ponta com as portas
 * em memória: controller, service e domínio de verdade, sem banco.
 */

let app: Awaited<ReturnType<typeof buildApp>>;
let repo: InMemoryScenarios;

const silent = { level: 'silent' as const };

beforeEach(async () => {
  repo = new InMemoryScenarios();
  app = await buildApp({
    health: {
      checkDatabase: async () => true,
      checkBroker: async () => true,
      checkObjectStore: async () => true,
    },
    auth: fakeAuth(),
    scenarios: repo,
    logger: silent,
  });
});

afterEach(async () => {
  await app.close();
});

async function createScenario(name = 'Ciclo Set/26') {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/scenarios',
    payload: { name },
  });
  return res.json() as { id: string; phase: string };
}

describe('criação e listagem', () => {
  it('cria um cenário em TEAM_SETUP', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/scenarios',
      payload: { name: 'Ciclo Set/26' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ name: 'Ciclo Set/26', phase: 'TEAM_SETUP' });
  });

  it('assume o criador como palavra final quando não informado (FR-012)', async () => {
    const scenario = await createScenario();
    expect(scenario).toMatchObject({ finalSayRole: 'CREATOR' });
  });

  it('aceita o aprovador como palavra final (FR-011)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/scenarios',
      payload: { name: 'X', finalSayRole: 'APPROVER' },
    });
    expect(res.json()).toMatchObject({ finalSayRole: 'APPROVER' });
  });

  it('recusa nome vazio', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/scenarios',
      payload: { name: '' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('a listagem traz a fase de cada cenário (FR-095)', async () => {
    await createScenario('A');
    await createScenario('B');
    const res = await app.inject({ method: 'GET', url: '/api/v1/scenarios' });
    const body = res.json() as { data: { phase: string }[]; total: number };
    expect(body.total).toBe(2);
    expect(body.data.every((s) => s.phase === 'TEAM_SETUP')).toBe(true);
  });

  it('a listagem é paginada', async () => {
    for (let i = 0; i < 5; i += 1) await createScenario(`C${i}`);
    const res = await app.inject({ method: 'GET', url: '/api/v1/scenarios?limit=2&offset=2' });
    const body = res.json() as { data: unknown[]; total: number; limit: number };
    expect(body.data).toHaveLength(2);
    expect(body.total).toBe(5);
    expect(body.limit).toBe(2);
  });
});

describe('acesso (FR-005)', () => {
  it('exige autenticação', async () => {
    const anon = await buildApp({
      health: {
        checkDatabase: async () => true,
        checkBroker: async () => true,
        checkObjectStore: async () => true,
      },
      auth: fakeAuth(null),
      scenarios: repo,
      logger: silent,
    });
    const res = await anon.inject({ method: 'GET', url: '/api/v1/scenarios' });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ error: { code: 'UNAUTHENTICATED' } });
    await anon.close();
  });

  it('quem não participa não enxerga o cenário', async () => {
    const scenario = await createScenario();
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/scenarios/${scenario.id}`,
      headers: { 'x-test-user': USER_B },
    });
    // 404, não 403: revelar que o cenário existe já seria vazamento.
    expect(res.statusCode).toBe(404);
  });

  it('participante convidado passa a enxergar', async () => {
    const scenario = await createScenario();
    repo.addMember(scenario.id, USER_B);
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/scenarios/${scenario.id}`,
      headers: { 'x-test-user': USER_B },
    });
    expect(res.statusCode).toBe(200);
  });

  it('cenário inexistente devolve 404', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/scenarios/018f0000-0000-7000-8000-0000000000ff',
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('ações disponíveis por fase (FR-097)', () => {
  it('em TEAM_SETUP permite convidar e fechar equipe', async () => {
    const scenario = await createScenario();
    const res = await app.inject({ method: 'GET', url: `/api/v1/scenarios/${scenario.id}` });
    const body = res.json() as { availableActions: string[] };
    expect(body.availableActions).toContain('INVITE_MEMBER');
    expect(body.availableActions).not.toContain('ADJUST_FORECAST');
  });

  it('em COLLABORATION permite ajustar e não permite convidar', async () => {
    const scenario = await createScenario();
    repo.setPhase(scenario.id, 'COLLABORATION');
    const res = await app.inject({ method: 'GET', url: `/api/v1/scenarios/${scenario.id}` });
    const body = res.json() as { availableActions: string[] };
    expect(body.availableActions).toContain('ADJUST_FORECAST');
    expect(body.availableActions).not.toContain('INVITE_MEMBER');
  });
});

describe('parametrização', () => {
  async function scenarioReadyForParams() {
    const scenario = await createScenario();
    repo.setPhase(scenario.id, 'IMPORT_SETUP');
    const levels = repo.setLevels(scenario.id, ['BU', 'Setor', 'CD']);
    return { scenario, levels };
  }

  const body = (over: Record<string, unknown> = {}) => ({
    groupingLevelIds: [] as string[],
    prorationMonths: 12,
    accuracyMetric: 'WMAPE',
    modelPackage: 'STANDARD',
    horizonMonths: 12,
    ...over,
  });

  it('lista os níveis declarados (FR-031)', async () => {
    const { scenario } = await scenarioReadyForParams();
    const res = await app.inject({ method: 'GET', url: `/api/v1/scenarios/${scenario.id}/levels` });
    const data = (res.json() as { data: { label: string }[] }).data;
    expect(data.map((l) => l.label)).toEqual(['BU', 'Setor', 'CD']);
  });

  it('aceita combinação de níveis (FR-032)', async () => {
    const { scenario, levels } = await scenarioReadyForParams();
    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/scenarios/${scenario.id}/parameters`,
      payload: body({ groupingLevelIds: [levels[0]!.id, levels[1]!.id] }),
    });
    expect(res.statusCode).toBe(200);
  });

  it('exige rateio quando a combinação é mais agregada (FR-032d)', async () => {
    const { scenario, levels } = await scenarioReadyForParams();
    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/scenarios/${scenario.id}/parameters`,
      payload: body({ groupingLevelIds: [levels[0]!.id] }),
    });
    expect(res.json()).toMatchObject({ prorationRequired: true });
  });

  it('dispensa rateio quando já é a granularidade original (FR-032d)', async () => {
    const { scenario, levels } = await scenarioReadyForParams();
    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/scenarios/${scenario.id}/parameters`,
      payload: body({ groupingLevelIds: levels.map((l) => l.id) }),
    });
    expect(res.json()).toMatchObject({ prorationRequired: false });
  });

  it('recusa combinação vazia (FR-032c)', async () => {
    const { scenario } = await scenarioReadyForParams();
    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/scenarios/${scenario.id}/parameters`,
      payload: body({ groupingLevelIds: [] }),
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: { code: 'VALIDATION_FAILED' } });
  });

  it('recusa nível repetido (FR-032b)', async () => {
    const { scenario, levels } = await scenarioReadyForParams();
    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/scenarios/${scenario.id}/parameters`,
      payload: body({ groupingLevelIds: [levels[0]!.id, levels[0]!.id] }),
    });
    expect(res.statusCode).toBe(400);
  });

  it('recusa meses de rateio além do histórico (FR-034)', async () => {
    const { scenario, levels } = await scenarioReadyForParams();
    repo.setStats(scenario.id, { availableHistoryMonths: 10, zeroMonthProportion: 0 });
    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/scenarios/${scenario.id}/parameters`,
      payload: body({ groupingLevelIds: [levels[0]!.id], prorationMonths: 24 }),
    });
    expect(res.statusCode).toBe(400);
  });

  it('avisa ao escolher MAPE em cenário com muitos zeros (FR-036a)', async () => {
    const { scenario, levels } = await scenarioReadyForParams();
    repo.setStats(scenario.id, { availableHistoryMonths: 24, zeroMonthProportion: 0.6 });
    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/scenarios/${scenario.id}/parameters`,
      payload: body({ groupingLevelIds: [levels[0]!.id], accuracyMetric: 'MAPE' }),
    });
    // Aviso, não impedimento: a escolha é do usuário.
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ zeroHeavyWarning: true });
  });

  it('recusa parametrizar fora da fase (FR-016)', async () => {
    const { scenario, levels } = await scenarioReadyForParams();
    repo.setPhase(scenario.id, 'COLLABORATION');
    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/scenarios/${scenario.id}/parameters`,
      payload: body({ groupingLevelIds: [levels[0]!.id] }),
    });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ error: { code: 'PHASE_NOT_ALLOWED' } });
  });
});

describe('pacotes de modelos (FR-034c)', () => {
  it('lista os três pacotes com modelos, janelas e contrapartida', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/model-packages' });
    const data = (res.json() as { data: { id: string; models: string[]; tradeoff: string }[] }).data;
    expect(data.map((p) => p.id)).toEqual(['FAST', 'STANDARD', 'COMPLETE']);
    expect(data.every((p) => p.models.length > 0 && p.tradeoff.length > 0)).toBe(true);
  });

  it('os pacotes são cumulativos, como no motor', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/model-packages' });
    const data = (res.json() as { data: { id: string; models: string[] }[] }).data;
    const [fast, standard, complete] = data;
    expect(fast!.models.every((m) => standard!.models.includes(m))).toBe(true);
    expect(standard!.models.every((m) => complete!.models.includes(m))).toBe(true);
    expect(complete!.models).toContain('AutoARIMA');
  });
});

describe('prévia de custo (FR-034a, FR-034d)', () => {
  it('devolve contagem de séries e tempo estimado', async () => {
    const scenario = await createScenario();
    const levels = repo.setLevels(scenario.id, ['BU', 'Setor', 'CD']);
    repo.setSeriesCount(scenario.id, [levels[0]!.id], 12);
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/scenarios/${scenario.id}/series-preview?levelIds=${levels[0]!.id}&package=STANDARD`,
    });
    expect(res.json()).toMatchObject({ seriesCount: 12, modelsEvaluated: 7, backtestWindows: 3 });
  });

  it('combinação mais granular custa muito mais — o ponto do FR-034a', async () => {
    const scenario = await createScenario();
    const levels = repo.setLevels(scenario.id, ['BU', 'Setor', 'CD']);
    const ids = levels.map((l) => l.id);
    repo.setSeriesCount(scenario.id, [ids[0]!], 12);
    repo.setSeriesCount(scenario.id, ids, 40000);

    const barato = await app.inject({
      method: 'GET',
      url: `/api/v1/scenarios/${scenario.id}/series-preview?levelIds=${ids[0]}&package=STANDARD`,
    });
    const caro = await app.inject({
      method: 'GET',
      url: `/api/v1/scenarios/${scenario.id}/series-preview?levelIds=${ids.join(',')}&package=COMPLETE`,
    });

    const a = barato.json() as { estimatedDurationSeconds: number; magnitude: string };
    const b = caro.json() as { estimatedDurationSeconds: number; magnitude: string };
    expect(b.estimatedDurationSeconds).toBeGreaterThan(a.estimatedDurationSeconds * 100);
    expect(a.magnitude).toBe('SECONDS');
    expect(b.magnitude).toBe('HOURS');
  });

  it('visão Cia quando nenhum nível é informado', async () => {
    const scenario = await createScenario();
    repo.setSeriesCount(scenario.id, [], 1);
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/scenarios/${scenario.id}/series-preview`,
    });
    expect(res.json()).toMatchObject({ seriesCount: 1 });
  });
});

describe('OpenAPI', () => {
  it('documenta as rotas de negócio', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/openapi.json' });
    const paths = Object.keys((res.json() as { paths: Record<string, unknown> }).paths);
    expect(paths).toContain('/api/v1/scenarios');
    expect(paths).toContain('/api/v1/model-packages');
  });
});
