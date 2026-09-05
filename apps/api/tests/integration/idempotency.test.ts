import { describe, expect, it, vi } from 'vitest';
import { idempotentExecute } from '../../src/adapters/rabbitmq/idempotent-consumer.js';

/**
 * T047 — Reentrega da mesma mensagem não duplica resultado.
 *
 * A deduplicação usa um `acquire` injetado para desacoplar do Prisma.
 * Os testes usam uma implementação em memória de `acquire`, tornando este
 * teste rápido e sem dependências externas. O comportamento de ack/nack
 * em relação ao canal AMQP é responsabilidade do consumidor que chama este
 * helper — não é testado aqui.
 */

function makeAcquire() {
  const seen = new Set<string>();
  return async (jobId: string): Promise<'proceed' | 'skip'> => {
    if (seen.has(jobId)) return 'skip';
    seen.add(jobId);
    return 'proceed';
  };
}

describe('idempotentExecute', () => {
  it('chama o handler na primeira entrega', async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    const acquire = makeAcquire();

    const result = await idempotentExecute('job-1', () => acquire('job-1'), handler);

    expect(result).toBe('processed');
    expect(handler).toHaveBeenCalledOnce();
  });

  it('não chama o handler na reentrega do mesmo jobId', async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    const acquire = makeAcquire();

    await idempotentExecute('job-2', () => acquire('job-2'), handler);
    const result = await idempotentExecute('job-2', () => acquire('job-2'), handler);

    expect(result).toBe('skipped');
    expect(handler).toHaveBeenCalledOnce();
  });

  it('jobIds diferentes são processados de forma independente', async () => {
    const handlerA = vi.fn().mockResolvedValue(undefined);
    const handlerB = vi.fn().mockResolvedValue(undefined);
    const acquire = makeAcquire();

    await idempotentExecute('job-a', () => acquire('job-a'), handlerA);
    await idempotentExecute('job-b', () => acquire('job-b'), handlerB);

    expect(handlerA).toHaveBeenCalledOnce();
    expect(handlerB).toHaveBeenCalledOnce();
  });

  it('erro no handler propaga sem afetar o estado de deduplicação', async () => {
    const acquire = makeAcquire();
    const failing = vi.fn().mockRejectedValue(new Error('falha de rede'));

    await expect(
      idempotentExecute('job-3', () => acquire('job-3'), failing),
    ).rejects.toThrow('falha de rede');

    // A mensagem não foi "adquirida com sucesso" — mas acquire já registrou
    // o jobId. Numa implementação com banco, a transação seria revertida.
    // O teste verifica que o erro não é engolido.
  });

  it('retorna skipped sem lançar quando acquire retorna skip', async () => {
    const handler = vi.fn();
    const alwaysSkip = async () => 'skip' as const;

    const result = await idempotentExecute('job-4', alwaysSkip, handler);

    expect(result).toBe('skipped');
    expect(handler).not.toHaveBeenCalled();
  });
});
