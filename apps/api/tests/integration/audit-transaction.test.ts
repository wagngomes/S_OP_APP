import { spawnSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { GenericContainer, type StartedTestContainer, Wait } from 'testcontainers';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { writeAuditEvent } from '../../src/services/audit/audit-writer.js';

/**
 * T056 — AuditEvent deve ser gravado na mesma transação da alteração.
 *
 * Prova:
 * 1. writeAuditEvent persiste dentro de uma transação bem-sucedida.
 * 2. Se a transação faz rollback, o AuditEvent some junto — jamais fica
 *    um evento órfão de uma operação que não aconteceu (FR-099, FR-100).
 */

let container: StartedTestContainer;
let prisma: PrismaClient;

beforeAll(async () => {
  container = await new GenericContainer('postgres:16-alpine')
    .withEnvironment({ POSTGRES_DB: 'sop_test', POSTGRES_USER: 'sop', POSTGRES_PASSWORD: 'sop' })
    .withExposedPorts(5432)
    .withWaitStrategy(Wait.forLogMessage('database system is ready to accept connections'))
    .start();

  const host = container.getHost();
  const port = container.getMappedPort(5432);
  const url = `postgresql://sop:sop@${host}:${port}/sop_test`;
  process.env.DATABASE_URL = url;

  prisma = new PrismaClient({ datasources: { db: { url } } });

  // Aplica migrações ao banco recém-criado
  // 'node' via PATH evita depender de symlinks do nvm (process.execPath aponta ao symlink)
  const prismaCli = new URL(
    '../../node_modules/prisma/build/index.js',
    import.meta.url,
  ).pathname.replace(/^\/([A-Z]:)/, '$1'); // remove leading / no Windows: /C:/... → C:/...
  const cwd = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
  const result = spawnSync(
    'node',
    [prismaCli, 'migrate', 'deploy'],
    { cwd, env: { ...process.env, DATABASE_URL: url }, stdio: 'pipe', shell: false },
  );
  if (result.status !== 0) {
    throw new Error(
      `prisma migrate deploy falhou:\nstdout: ${result.stdout?.toString()}\nstderr: ${result.stderr?.toString()}\nerror: ${result.error}`,
    );
  }
}, 120_000);

afterAll(async () => {
  await prisma.$disconnect();
  await container.stop();
});

/** Cria um usuário e cenário mínimos para satisfazer as FK do AuditEvent. */
async function seedScenario() {
  const user = await prisma.user.create({
    data: {
      email: `audit-test-${Date.now()}@example.com`,
      name: 'Test User',
    },
  });

  const scenario = await prisma.scenario.create({
    data: {
      name: 'Cenário de teste',
      createdById: user.id,
      phase: 'TEAM_SETUP',
      finalSayRole: 'CREATOR',
      forecastHorizonMonths: 3,
    },
  });

  return { user, scenario };
}

describe('writeAuditEvent — atomicidade transacional', () => {
  it('persiste o AuditEvent quando a transação faz commit', async () => {
    const { user, scenario } = await seedScenario();

    await prisma.$transaction(async (tx) => {
      await writeAuditEvent({
        tx,
        scenarioId: scenario.id,
        entityType: 'Scenario',
        entityId: scenario.id,
        action: 'PHASE_ADVANCED',
        actorId: user.id,
        origin: 'UI',
        correlationId: 'corr-commit-test',
      });
    });

    const events = await prisma.auditEvent.findMany({
      where: { scenarioId: scenario.id, correlationId: 'corr-commit-test' },
    });
    expect(events).toHaveLength(1);
    expect(events[0].action).toBe('PHASE_ADVANCED');
  });

  it('desfaz o AuditEvent quando a transação faz rollback', async () => {
    const { scenario } = await seedScenario();
    const correlationId = `corr-rollback-${Date.now()}`;

    await expect(
      prisma.$transaction(async (tx) => {
        await writeAuditEvent({
          tx,
          scenarioId: scenario.id,
          entityType: 'Scenario',
          entityId: scenario.id,
          action: 'PARAMETERS_CHANGED',
          origin: 'SYSTEM',
          correlationId,
        });
        // Forçar rollback depois de gravar o AuditEvent
        throw new Error('rollback intencional');
      }),
    ).rejects.toThrow('rollback intencional');

    const events = await prisma.auditEvent.findMany({
      where: { scenarioId: scenario.id, correlationId },
    });
    // O evento não deve existir — rollback desfez tudo
    expect(events).toHaveLength(0);
  });

  it('aceita payload opcional sem falhar', async () => {
    const { user, scenario } = await seedScenario();

    await prisma.$transaction(async (tx) => {
      await writeAuditEvent({
        tx,
        scenarioId: scenario.id,
        entityType: 'Scenario',
        entityId: scenario.id,
        action: 'PARAMETERS_CHANGED',
        actorId: user.id,
        origin: 'UI',
        correlationId: 'corr-payload-test',
        payload: { before: 'FAST', after: 'COMPLETE' },
      });
    });

    const event = await prisma.auditEvent.findFirst({
      where: { correlationId: 'corr-payload-test' },
    });
    expect(event?.payload).toEqual({ before: 'FAST', after: 'COMPLETE' });
  });
});
