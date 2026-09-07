import type { Channel } from 'amqplib';
import { randomUUID } from 'node:crypto';
import { EXCHANGES, QUEUES } from './topology.js';
import type { NotificationPort } from '../../composition/ports.js';

/**
 * Publica pedidos de e-mail na fila do email-worker (FR-053, FR-093).
 *
 * Cada destinatário recebe uma mensagem separada para garantir retry e DLQ
 * individuais — a falha num endereço inválido não bloqueia os demais.
 */
export class RabbitMQNotificationPort implements NotificationPort {
  constructor(private readonly channel: Channel) {}

  async notifyForecastReady(input: {
    scenarioId: string;
    scenarioName: string;
    approverEmails: string[];
    correlationId: string;
  }): Promise<void> {
    for (const to of input.approverEmails) {
      this.#publish({
        notificationId: randomUUID(),
        scenarioId: input.scenarioId,
        template: 'FORECAST_READY',
        to,
        variables: { scenarioName: input.scenarioName },
        correlationId: input.correlationId,
      });
    }
  }

  async notifyPhaseAdvanced(input: {
    scenarioId: string;
    scenarioName: string;
    phase: string;
    recipientEmails: string[];
    correlationId: string;
  }): Promise<void> {
    const template =
      input.phase === 'COLLABORATION' ? 'COLLABORATION_OPENED' : 'PHASE_ADVANCED';
    for (const to of input.recipientEmails) {
      this.#publish({
        notificationId: randomUUID(),
        scenarioId: input.scenarioId,
        template,
        to,
        variables: { scenarioName: input.scenarioName, phase: input.phase },
        correlationId: input.correlationId,
      });
    }
  }

  #publish(msg: {
    notificationId: string;
    scenarioId: string;
    template: string;
    to: string;
    variables: Record<string, string>;
    correlationId: string;
  }): void {
    const envelope = {
      messageId: randomUUID(),
      correlationId: msg.correlationId,
      occurredAt: new Date().toISOString(),
      type: 'email.request',
      payload: {
        notificationId: msg.notificationId,
        scenarioId: msg.scenarioId,
        template: msg.template,
        to: msg.to,
        variables: msg.variables,
      },
    };
    const content = Buffer.from(JSON.stringify(envelope));
    this.channel.publish(EXCHANGES.EMAIL, QUEUES.EMAIL_REQUEST, content, {
      persistent: true,
      contentType: 'application/json',
      correlationId: msg.correlationId,
    });
  }
}
