import type { FastifyBaseLogger } from 'fastify';
import type { NotificationPort } from '../composition/ports.js';

/**
 * Wrapper de notificação com isolamento de falha (FR-096).
 *
 * Cada método `safe*` chama o port em try/catch para garantir que uma falha
 * de entrega de e-mail nunca desfaz a transação de negócio já confirmada.
 */
export class NotificationService {
  constructor(
    private readonly notification: NotificationPort,
    private readonly logger: FastifyBaseLogger,
  ) {}

  async safeNotifyPhaseAdvanced(input: {
    scenarioId: string;
    scenarioName: string;
    phase: string;
    recipientEmails: string[];
    correlationId: string;
  }): Promise<void> {
    if (input.recipientEmails.length === 0) return;
    try {
      await this.notification.notifyPhaseAdvanced(input);
    } catch (err) {
      this.logger.error({ err }, 'notificação de fase falhou; transição já confirmada');
    }
  }
}
