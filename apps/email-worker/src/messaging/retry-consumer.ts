import type { Channel, ConsumeMessage } from 'amqplib';

const RETRY_COUNT_HEADER = 'x-retry-count';
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_DELAYS = [1_000, 8_000, 64_000]; // ms

export type RetryOptions = {
  maxAttempts?: number;
  /** Delay em ms antes de cada retentativa (indexed by attempt, starting at 0). */
  delays?: number[];
};

/**
 * Consome `queue` com retentativa e roteamento para DLQ.
 *
 * Cada mensagem é tentada até `maxAttempts` vezes com backoff entre tentativas.
 * Esgotadas as tentativas, a mensagem é nack'd (requeue=false) e vai para a DLQ.
 *
 * O attempt count é rastreado via header `x-retry-count` para sobreviver a
 * restarts do worker.
 */
export async function consumeWithRetry(
  channel: Channel,
  queue: string,
  handler: (payload: unknown) => Promise<void>,
  opts: RetryOptions = {},
): Promise<void> {
  const maxAttempts = opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const delays = opts.delays ?? DEFAULT_DELAYS;

  await channel.prefetch(1);

  channel.consume(queue, async (msg: ConsumeMessage | null) => {
    if (!msg) return;

    const retryCount = parseRetryCount(msg);
    const attempt = retryCount + 1;

    try {
      const payload: unknown = JSON.parse(msg.content.toString());
      await handler(payload);
      channel.ack(msg);
    } catch {
      if (attempt >= maxAttempts) {
        // Esgotadas as tentativas → DLQ
        channel.nack(msg, false, false);
      } else {
        // Retentativa: ack + republica com contador incrementado após delay
        const delay = delays[Math.min(retryCount, delays.length - 1)] ?? 0;
        await sleep(delay);
        channel.ack(msg);
        channel.publish(
          msg.fields.exchange,
          queue,
          msg.content,
          {
            ...msg.properties,
            headers: {
              ...msg.properties.headers,
              [RETRY_COUNT_HEADER]: String(attempt),
            },
          },
        );
      }
    }
  });
}

function parseRetryCount(msg: ConsumeMessage): number {
  const raw = msg.properties.headers?.[RETRY_COUNT_HEADER];
  if (raw === undefined || raw === null) return 0;
  const n = parseInt(String(raw), 10);
  return isNaN(n) ? 0 : n;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
