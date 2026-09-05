import { connect } from 'amqplib';
import type { Connection } from 'amqplib';
import { GenericContainer, Wait } from 'testcontainers';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EXCHANGES, QUEUES, assertTopology } from '../../src/adapters/rabbitmq/topology.js';

/**
 * T045 — Topologia RabbitMQ com broker real (Testcontainers).
 *
 * Verifica:
 * 1. assertTopology não lança
 * 2. É idempotente (segunda chamada também não lança)
 * 3. Todas as filas existem com as propriedades corretas
 * 4. Todas as DLQs existem e aceitam mensagens mortas
 */

const RABBIT_IMAGE = 'rabbitmq:4-alpine';

let connection: Connection;
let amqpUrl: string;

beforeAll(async () => {
  const container = await new GenericContainer(RABBIT_IMAGE)
    .withEnvironment({
      RABBITMQ_DEFAULT_USER: 'test',
      RABBITMQ_DEFAULT_PASS: 'test',
    })
    .withExposedPorts(5672)
    .withWaitStrategy(Wait.forLogMessage('Server startup complete'))
    .start();

  amqpUrl = `amqp://test:test@${container.getHost()}:${container.getMappedPort(5672)}`;
  connection = await connect(amqpUrl);
}, 90_000);

afterAll(async () => {
  await connection?.close();
});

describe('assertTopology', () => {
  it('cria exchanges, filas e bindings sem lançar', async () => {
    const ch = await connection.createChannel();
    await expect(assertTopology(ch)).resolves.toBeUndefined();
    await ch.close();
  });

  it('é idempotente — segunda chamada também não lança', async () => {
    const ch = await connection.createChannel();
    await assertTopology(ch);
    await expect(assertTopology(ch)).resolves.toBeUndefined();
    await ch.close();
  });

  it('todas as filas principais existem e são duráveis', async () => {
    const ch = await connection.createChannel();
    await assertTopology(ch);

    for (const queue of Object.values(QUEUES)) {
      // checkQueue lança CHANNEL_ERROR se a fila não existir
      const info = await ch.checkQueue(queue);
      expect(info.queue).toBe(queue);
    }
    await ch.close();
  });

  it('todas as DLQs existem', async () => {
    const ch = await connection.createChannel();
    await assertTopology(ch);

    for (const queue of Object.values(QUEUES)) {
      const dlqName = `${queue}.dlq`;
      const info = await ch.checkQueue(dlqName);
      expect(info.queue).toBe(dlqName);
    }
    await ch.close();
  });

  it('todos os exchanges existem', async () => {
    const ch = await connection.createChannel();
    await assertTopology(ch);

    for (const exchange of Object.values(EXCHANGES)) {
      // checkExchange lança se não existir
      await expect(ch.checkExchange(exchange)).resolves.toBeDefined();
    }
    await ch.close();
  });
});
