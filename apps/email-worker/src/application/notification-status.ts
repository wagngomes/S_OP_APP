import type { NotificationStatusPort } from '../composition/ports.js';

/**
 * Registra o resultado da tentativa de envio no banco.
 *
 * Incrementa o contador de tentativas antes de cada envio.
 * Se o envio for bem-sucedido, marca como SENT.
 * Em caso de falha, marca como FAILED com o motivo.
 */
export async function recordSent(
  port: NotificationStatusPort,
  notificationId: string,
  providerMessageId: string,
): Promise<void> {
  await port.markSent(notificationId, providerMessageId);
}

export async function recordFailed(
  port: NotificationStatusPort,
  notificationId: string,
  error: unknown,
): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  await port.markFailed(notificationId, message);
}
