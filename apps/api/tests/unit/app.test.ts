import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import type { AppDependencies } from '../../src/composition/ports.js';
import { InMemoryScenarios, fakeAuth } from '../fakes/in-memory-scenarios.js';

/**
 * Testes do esqueleto da API via `app.inject()`: sem rede, sem banco, sem Docker.
 *
 * As dependências entram por porta (Princípio IV), então o servidor é exercitável
 * com implementações falsas — que é o que torna estes testes possíveis nesta
 * máquina, onde não há Docker.
 */

const healthyDeps = (over: Partial<AppDependencies> = {}): AppDependencies => ({
  health: {
    checkDatabase: async () => true,
    checkBroker: async () => true,
    checkObjectStore: async () => true,
  },
  ...over,
});

let app: Awaited<ReturnType<typeof buildApp>> | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe('bootstrap', () => {
  it('sobe e responde', async () => {
    app = await buildApp(healthyDeps());
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
  });

  it('serve a OpenAPI derivada dos schemas Zod', async () => {
    // As rotas de negócio só existem quando as portas são injetadas, então a
    // OpenAPI com caminhos exige um app completo — não o esqueleto puro.
    app = await buildApp({
      ...healthyDeps(),
      auth: fakeAuth(),
      scenarios: new InMemoryScenarios(),
    });
    const res = await app.inject({ method: 'GET', url: '/api/v1/openapi.json' });
    expect(res.statusCode).toBe(200);
    const doc = res.json() as { openapi: string; paths: Record<string, unknown> };
    expect(doc.openapi).toMatch(/^3\./);
    expect(Object.keys(doc.paths).length).toBeGreaterThan(0);
  });

  it('o esqueleto sem portas sobe e serve a OpenAPI, ainda que sem rotas de negócio', async () => {
    app = await buildApp(healthyDeps());
    const res = await app.inject({ method: 'GET', url: '/api/v1/openapi.json' });
    expect(res.statusCode).toBe(200);
  });
});

describe('health', () => {
  it('liveness verifica o banco', async () => {
    app = await buildApp(healthyDeps());
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.json()).toMatchObject({ status: 'ok', database: 'up' });
  });

  it('liveness falha com 503 quando o banco está fora', async () => {
    app = await buildApp(
      healthyDeps({
        health: {
          checkDatabase: async () => false,
          checkBroker: async () => true,
          checkObjectStore: async () => true,
        },
      }),
    );
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ database: 'down' });
  });

  it('readiness também verifica fila e armazenamento', async () => {
    app = await buildApp(healthyDeps());
    const res = await app.inject({ method: 'GET', url: '/api/health/ready' });
    expect(res.json()).toMatchObject({ database: 'up', broker: 'up', objectStore: 'up' });
  });

  it('readiness cai quando a fila está fora, mas liveness continua de pé', async () => {
    // A separação existe para que uma falha temporária do RabbitMQ tire a API do
    // balanceamento sem derrubar o contêiner.
    app = await buildApp(
      healthyDeps({
        health: {
          checkDatabase: async () => true,
          checkBroker: async () => false,
          checkObjectStore: async () => true,
        },
      }),
    );
    expect((await app.inject({ method: 'GET', url: '/api/health' })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/api/health/ready' })).statusCode).toBe(503);
  });

  it('não quebra quando a verificação lança', async () => {
    app = await buildApp(
      healthyDeps({
        health: {
          checkDatabase: async () => {
            throw new Error('conexão recusada');
          },
          checkBroker: async () => true,
          checkObjectStore: async () => true,
        },
      }),
    );
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(503);
  });
});

describe('correlationId (Princípio IX)', () => {
  it('gera um quando o cliente não envia', async () => {
    app = await buildApp(healthyDeps());
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.headers['x-correlation-id']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it('preserva o que o cliente enviou, para a cadeia não se partir', async () => {
    app = await buildApp(healthyDeps());
    const given = '018f3a2b-4c5d-7e8f-9a0b-1c2d3e4f5a6b';
    const res = await app.inject({
      method: 'GET',
      url: '/api/health',
      headers: { 'x-correlation-id': given },
    });
    expect(res.headers['x-correlation-id']).toBe(given);
  });

  it('substitui valor malformado em vez de propagar lixo', async () => {
    app = await buildApp(healthyDeps());
    const res = await app.inject({
      method: 'GET',
      url: '/api/health',
      headers: { 'x-correlation-id': 'nao-e-uuid' },
    });
    expect(res.headers['x-correlation-id']).not.toBe('nao-e-uuid');
  });
});

describe('métricas (Princípio IX)', () => {
  it('expõe /metrics no formato Prometheus', async () => {
    app = await buildApp(healthyDeps());
    const res = await app.inject({ method: 'GET', url: '/metrics' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/plain');
    expect(res.body).toContain('process_cpu_user_seconds_total');
  });

  it('contabiliza requisições HTTP por rota', async () => {
    app = await buildApp(healthyDeps());
    await app.inject({ method: 'GET', url: '/api/health' });
    const res = await app.inject({ method: 'GET', url: '/metrics' });
    expect(res.body).toContain('sop_http_request_duration_seconds');
  });
});

describe('tratamento de erro', () => {
  it('rota inexistente devolve o formato de erro do contrato', async () => {
    app = await buildApp(healthyDeps());
    const res = await app.inject({ method: 'GET', url: '/api/v1/nao-existe' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: { code: 'NOT_FOUND' } });
  });

  it('erro de validação devolve VALIDATION_FAILED com detalhes', async () => {
    app = await buildApp(healthyDeps());
    const res = await app.inject({ method: 'GET', url: '/api/v1/_echo?limit=abc' });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: { code: 'VALIDATION_FAILED' } });
  });

  it('não vaza detalhe interno em erro inesperado', async () => {
    app = await buildApp(healthyDeps());
    const res = await app.inject({ method: 'GET', url: '/api/v1/_boom' });
    expect(res.statusCode).toBe(500);
    const body = res.json() as { error: { code: string; message: string } };
    expect(body.error.code).toBe('INTERNAL');
    expect(body.error.message).not.toContain('segredo');
  });
});

describe('paginação (contrato)', () => {
  it('aplica o limite padrão de 100', async () => {
    app = await buildApp(healthyDeps());
    const res = await app.inject({ method: 'GET', url: '/api/v1/_echo' });
    expect(res.json()).toMatchObject({ limit: 100, offset: 0 });
  });

  it('respeita limite e offset informados', async () => {
    app = await buildApp(healthyDeps());
    const res = await app.inject({ method: 'GET', url: '/api/v1/_echo?limit=25&offset=50' });
    expect(res.json()).toMatchObject({ limit: 25, offset: 50 });
  });

  it('recusa limite acima do teto', async () => {
    app = await buildApp(healthyDeps());
    const res = await app.inject({ method: 'GET', url: '/api/v1/_echo?limit=5000' });
    expect(res.statusCode).toBe(400);
  });
});

describe('versionamento', () => {
  it('as rotas de negócio vivem sob /api/v1', async () => {
    app = await buildApp(healthyDeps());
    const res = await app.inject({ method: 'GET', url: '/api/v1/_echo' });
    expect(res.statusCode).toBe(200);
  });

  it('health e metrics ficam fora do versionamento', async () => {
    app = await buildApp(healthyDeps());
    expect((await app.inject({ method: 'GET', url: '/api/health' })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/metrics' })).statusCode).toBe(200);
  });
});

describe('correlação nos LOGS, não só no header', () => {
  /**
   * Este bloco existe porque a primeira versão passava no teste de header e
   * mesmo assim emitia `"correlationId":""` em toda linha de log. O header
   * satisfazia a asserção; o Princípio IX não estava atendido.
   *
   * O Fastify emite "incoming request" ANTES de qualquer hook rodar, então
   * decorar a requisição num hook chega tarde demais para a primeira linha.
   */
  function capturingLogger() {
    const lines: string[] = [];
    return {
      lines,
      logger: {
        level: 'info',
        stream: {
          write(chunk: string) {
            lines.push(chunk);
          },
        },
      },
    };
  }

  it('toda linha de log carrega a correlação', async () => {
    const { lines, logger } = capturingLogger();
    app = await buildApp({ ...healthyDeps(), logger });

    const given = '018f3a2b-4c5d-7e8f-9a0b-1c2d3e4f5a6b';
    await app.inject({
      method: 'GET',
      url: '/api/health',
      headers: { 'x-correlation-id': given },
    });

    const requestLines = lines
      .map((l) => JSON.parse(l) as Record<string, unknown>)
      .filter((l) => typeof l.reqId === 'string');

    expect(requestLines.length).toBeGreaterThan(0);
    for (const line of requestLines) {
      expect(line.reqId).toBe(given);
    }
  });

  it('a PRIMEIRA linha da requisição já vem correlacionada', async () => {
    const { lines, logger } = capturingLogger();
    app = await buildApp({ ...healthyDeps(), logger });

    const given = '018f3a2b-4c5d-7e8f-9a0b-1c2d3e4f5a6c';
    await app.inject({
      method: 'GET',
      url: '/api/health',
      headers: { 'x-correlation-id': given },
    });

    const first = lines
      .map((l) => JSON.parse(l) as Record<string, unknown>)
      .find((l) => l.msg === 'incoming request');

    expect(first?.reqId).toBe(given);
  });

  it('o log de erro carrega a correlação para investigar depois', async () => {
    const { lines, logger } = capturingLogger();
    app = await buildApp({ ...healthyDeps(), logger });

    const res = await app.inject({ method: 'GET', url: '/api/v1/_boom' });
    const returned = (res.json() as { error: { details: { correlationId: string } } }).error.details
      .correlationId;

    const errorLine = lines
      .map((l) => JSON.parse(l) as Record<string, unknown>)
      .find((l) => l.msg === 'erro não tratado');

    expect(errorLine?.correlationId).toBe(returned);
  });
});
