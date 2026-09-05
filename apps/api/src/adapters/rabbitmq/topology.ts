import type { Channel } from 'amqplib';

/**
 * Topologia RabbitMQ do SOP_APP (contracts/messaging.md).
 *
 * Cada fila tem um DLX (`sop.dlx`) + DLQ (`<fila>.dlq`). A função
 * `assertTopology` é idempotente: pode ser chamada múltiplas vezes sem erro,
 * o que permite subir a API mesmo quando o RabbitMQ já foi inicializado.
 *
 * Ordem de declaração importa: DLX → DLQs → filas principais → bindings.
 * Declarar uma fila com x-dead-letter-exchange antes de o exchange existir
 * não causa erro no RabbitMQ, mas declarar uma fila com argumento para uma
 * DLQ que ainda não existe resulta em mensagem morta sem destino configurado.
 */

export const EXCHANGES = {
  INGESTION: 'sop.ingestion',
  FORECAST: 'sop.forecast',
  ACCURACY: 'sop.accuracy',
  EMAIL: 'sop.email',
  DLX: 'sop.dlx',
} as const;

export const QUEUES = {
  INGESTION_REQUEST: 'sop.ingestion.request.v1',
  FORECAST_REQUEST: 'sop.forecast.request.v1',
  FORECAST_RESULT: 'sop.forecast.result.v1',
  ACCURACY_REQUEST: 'sop.accuracy.request.v1',
  ACCURACY_RESULT: 'sop.accuracy.result.v1',
  EMAIL_REQUEST: 'sop.email.request.v1',
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

type QueueDef = {
  exchange: string;
  name: QueueName;
};

const QUEUE_DEFS: QueueDef[] = [
  { exchange: EXCHANGES.INGESTION, name: QUEUES.INGESTION_REQUEST },
  { exchange: EXCHANGES.FORECAST,  name: QUEUES.FORECAST_REQUEST },
  { exchange: EXCHANGES.FORECAST,  name: QUEUES.FORECAST_RESULT },
  { exchange: EXCHANGES.ACCURACY,  name: QUEUES.ACCURACY_REQUEST },
  { exchange: EXCHANGES.ACCURACY,  name: QUEUES.ACCURACY_RESULT },
  { exchange: EXCHANGES.EMAIL,     name: QUEUES.EMAIL_REQUEST },
];

export async function assertTopology(channel: Channel): Promise<void> {
  // 1. DLX — deve existir antes das DLQs que nele se ligam
  await channel.assertExchange(EXCHANGES.DLX, 'direct', { durable: true });

  // 2. Exchanges de aplicação
  for (const [key, name] of Object.entries(EXCHANGES)) {
    if (key !== 'DLX') {
      await channel.assertExchange(name, 'direct', { durable: true });
    }
  }

  // 3. Para cada fila: DLQ → fila principal → binding
  for (const def of QUEUE_DEFS) {
    const dlqName = `${def.name}.dlq` as const;

    // DLQ ligada ao DLX com routing key igual ao nome da fila principal
    await channel.assertQueue(dlqName, { durable: true });
    await channel.bindQueue(dlqName, EXCHANGES.DLX, def.name);

    // Fila principal com x-dead-letter-exchange
    await channel.assertQueue(def.name, {
      durable: true,
      arguments: {
        'x-dead-letter-exchange': EXCHANGES.DLX,
        'x-dead-letter-routing-key': def.name,
      },
    });

    // Binding fila → exchange com routing key = nome da fila
    await channel.bindQueue(def.name, def.exchange, def.name);
  }
}
