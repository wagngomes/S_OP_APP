import type { Channel, ConsumeMessage } from 'amqplib';

/**
 * Retentativa com backoff exponencial + roteamento para DLQ (contracts/messaging.md).
 *
 * Até 3 retentativas após a primeira falha — 4 tentativas totais:
 *   1ª falha  → aguarda 1 s  → republica
 *   2ª falha  → aguarda 8 s  → republica
 *   3ª falha  → aguarda 64 s → republica
 *   4ª falha  → nack(requeue=false) → DLX → DLQ
 *
 * O ack/nack da mensagem original acontece aqui. A lógica de negócio é
 * injetada via `handler` e não precisa conhecer o canal AMQP.
 */

const DELAYS_MS = [1_000, 8_000, 64_000] as const;
const MAX_RETRIES = DELAYS_MS.length; // 3 retentativas → 4 tentativas totais

const HEADER_RETRY_COUNT = 'x-sop-retry-count';

export async function withRetry(
  channel: Channel,
  message: ConsumeMessage,
  queue: string,
  handler: () => Promise<void>,
): Promise<void> {
  const retryCount = Number(message.properties.headers?.[HEADER_RETRY_COUNT] ?? 0);

  try {
    await handler();
    channel.ack(message);
  } catch {
    if (retryCount >= MAX_RETRIES) {
      // Esgotadas as retentativas — manda para DLX/DLQ
      channel.nack(message, false, false);
      return;
    }

    // Ack para remover da fila corrente, depois republica com delay
    channel.ack(message);

    const delayMs = DELAYS_MS[retryCount] ?? DELAYS_MS[DELAYS_MS.length - 1];
    await new Promise<void>((resolve) => setTimeout(resolve, delayMs));

    // Publica no default exchange com routing key = nome da fila
    channel.publish('', queue, message.content, {
      ...message.properties,
      headers: {
        ...message.properties.headers,
        [HEADER_RETRY_COUNT]: retryCount + 1,
      },
    });
  }
}
