import { z } from 'zod';

/**
 * Payload de `email.request`.
 *
 * Cada mensagem notifica UM destinatário — o publicador cria N mensagens para
 * N destinatários. Isso garante retry e DLQ por destinatário, sem que a falha
 * num endereço inválido bloqueie os demais.
 *
 * `notificationId` é o id de `EmailNotification` no banco — permite ao worker
 * atualizar status sem consulta extra e funciona como chave de idempotência.
 *
 * Ver: specs/001-sop-cycle-forecasting/contracts/messaging.md
 */

export const EmailTemplate = z.enum([
  'FORECAST_READY',
  'PHASE_ADVANCED',
  'COLLABORATION_OPENED',
]);
export type EmailTemplate = z.infer<typeof EmailTemplate>;

export const EmailRequestPayload = z.object({
  notificationId: z.string().uuid(),
  scenarioId: z.string().uuid(),
  template: EmailTemplate,
  to: z.string().email(),
  variables: z.record(z.string(), z.string()),
});
export type EmailRequestPayload = z.infer<typeof EmailRequestPayload>;
