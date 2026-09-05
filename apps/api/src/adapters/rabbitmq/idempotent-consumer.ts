/**
 * Helper de consumidor idempotente (D6).
 *
 * Separa a lógica de deduplicação da mecânica do canal AMQP. O `acquire`
 * injetado é quem conhece o banco; este módulo só orquestra:
 *
 *   1. Tenta adquirir o lock via `acquire`.
 *   2. Se 'skip': entrega duplicada — retorna sem chamar o handler.
 *   3. Se 'proceed': chama o handler; qualquer erro propaga sem ser engolido
 *      para que o consumidor possa decidir entre nack ou DLQ.
 *
 * O ack/nack ao canal AMQP é responsabilidade do consumidor que chama
 * esta função, nunca desta camada.
 */

export type AcquireResult = 'proceed' | 'skip';

/**
 * @param jobId   - Identificador único do job (chave de deduplicação).
 * @param acquire - Callback que tenta registrar o jobId atomicamente.
 *                  Deve retornar 'proceed' na primeira entrega e 'skip' em
 *                  reentregar — tipicamente via INSERT com unicidade ou
 *                  UPDATE condicional no banco em transação.
 * @param handler - Lógica de negócio a executar quando não for duplicata.
 * @returns       - 'processed' se o handler rodou, 'skipped' se foi duplicata.
 */
export async function idempotentExecute(
  jobId: string,
  acquire: (jobId: string) => Promise<AcquireResult>,
  handler: () => Promise<void>,
): Promise<'processed' | 'skipped'> {
  const result = await acquire(jobId);

  if (result === 'skip') {
    return 'skipped';
  }

  await handler();
  return 'processed';
}
