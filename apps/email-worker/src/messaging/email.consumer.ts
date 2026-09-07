import { EmailRequestPayload } from '@sop/contracts';
import { renderTemplate } from '../application/templates/index.js';
import { recordFailed, recordSent } from '../application/notification-status.js';
import type { EmailWorkerPorts } from '../composition/ports.js';

/**
 * Handler de `sop.email.request.v1` (T159).
 *
 * Parseia o payload, renderiza o template, envia via `ports.sender` e
 * actualiza o status da notificação via `ports.status`.
 *
 * Lança em caso de falha — a camada `consumeWithRetry` é responsável pelo
 * backoff e pelo roteamento para DLQ.
 */
export async function processEmailRequest(
  rawPayload: unknown,
  ports: EmailWorkerPorts,
): Promise<void> {
  const { notificationId, to, template, variables } = EmailRequestPayload.parse(rawPayload);

  await ports.status.incrementAttempt(notificationId);

  const { subject, html } = renderTemplate(template, variables);

  try {
    const providerMessageId = await ports.sender.send({ to, subject, html });
    await recordSent(ports.status, notificationId, providerMessageId);
  } catch (err) {
    await recordFailed(ports.status, notificationId, err);
    throw err;
  }
}
