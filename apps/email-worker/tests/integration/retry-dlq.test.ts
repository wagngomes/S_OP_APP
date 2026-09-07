import { connect } from 'amqplib';
import type { Channel, Connection } from 'amqplib';
import { GenericContainer, Wait } from 'testcontainers';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { consumeWithRetry } from '../../src/messaging/retry-consumer.js';

/**
 * T156 — retentativa com backoff e roteamento para DLQ.
 *
 * Usa um RabbitMQ real (testcontainers) para verificar que:
 * 1. Um handler que sempre lança é tentado exatamente N vezes.
 * 2. Após esgotar as tentativas, a mensagem vai para a DLQ.
 */

const RABBIT_IMAGE = 'rabbitmq:4-alpine';
const QUEUE = 'sop.email.request.v1.test';
const DLQ = `${QUEUE}.dlq`;
const DLX = 'sop.dlx.test';
const EXCHANGE = 'sop.email.test';

async function assertMinimalTopology(ch: Channel): Promise<void> {
  await ch.assertExchange(DLX, 'direct', { durable: true });
  await ch.assertExchange(EXCHANGE, 'direct', { durable: true });
  await ch.assertQueue(DLQ, { durable: true });
  await ch.bindQueue(DLQ, DLX, QUEUE);
  await ch.assertQueue(QUEUE, {
    durable: true,
    arguments: {
      'x-dead-letter-exchange': DLX,
      'x-dead-letter-routing-key': QUEUE,
    },
  });
  await ch.bindQueue(QUEUE, EXCHANGE, QUEUE);
}

function waitForDlqMessage(ch: Channel, timeoutMs = 10_000): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('timeout aguardando mensagem na DLQ')),
      timeoutMs,
    );
    ch.consume(DLQ, (msg) => {
      if (!msg) return;
      clearTimeout(timer);
      ch.ack(msg);
      resolve(msg.content);
    });
  });
}

let connection: Connection;

beforeAll(async () => {
  const container = await new GenericContainer(RABBIT_IMAGE)
    .withEnvironment({ RABBITMQ_DEFAULT_USER: 'test', RABBITMQ_DEFAULT_PASS: 'test' })
    .withExposedPorts(5672)
    .withWaitStrategy(Wait.forLogMessage('Server startup complete'))
    .start();

  const url = `amqp://test:test@${container.getHost()}:${container.getMappedPort(5672)}`;
  connection = await connect(url);
}, 90_000);

afterAll(async () => { await connection?.close(); });

describe('consumeWithRetry', () => {
  it('tenta 3 vezes e manda para DLQ quando handler sempre falha', async () => {
    const ch = await connection.createChannel();
    await assertMinimalTopology(ch);

    const handler = vi.fn().mockRejectedValue(new Error('falha simulada'));

    await consumeWithRetry(ch, QUEUE, handler, {
      maxAttempts: 3,
      delays: [0, 0], // sem espera nos testes
    });

    // Publica uma mensagem de teste
    const msgContent = Buffer.from(
      JSON.stringify({
        notificationId: randomUUID(),
        scenarioId: randomUUID(),
        template: 'PHASE_ADVANCED',
        to: 'test@example.com',
        variables: { scenarioName: 'Teste', phase: 'COLLABORATION' },
      }),
    );
    ch.publish(EXCHANGE, QUEUE, msgContent, {
      persistent: true,
      contentType: 'application/json',
    });

    // Aguarda a mensagem aparecer na DLQ (máximo 10s)
    const dlqMsg = await waitForDlqMessage(ch);
    expect(dlqMsg.toString()).toBe(msgContent.toString());

    // Handler foi chamado exatamente 3 vezes
    expect(handler).toHaveBeenCalledTimes(3);

    await ch.close();
  }, 30_000);
});
