import type { Channel } from 'amqplib';
import { randomUUID } from 'node:crypto';
import { QUEUES } from './topology.js';
import type { NotificationPort } from '../../composition/ports.js';

/**
 * Publica pedido de e-mail na fila do email-worker (FR-053).
 *
 * O worker de e-mail consome `sop.email.request.v1`, renderiza o template
 * FORECAST_READY e envia via Resend.
 */
export class RabbitMQNotificationPort implements NotificationPort {
  constructor(private readonly channel: Channel) {}

  async notifyForecastReady(input: {
    scenarioId: string;
    scenarioName: string;
    approverEmails: string[];
    correlationId: string;
  }): Promise<void> {
    const payload = {
      messageId: randomUUID(),
      correlationId: input.correlationId,
      occurredAt: new Date().toISOString(),
      type: 'email.request',
      payload: {
        template: 'FORECAST_READY',
        to: input.approverEmails,
        data: {
          scenarioId: input.scenarioId,
          scenarioName: input.scenarioName,
        },
      },
    };

    const content = Buffer.from(JSON.stringify(payload));
    this.channel.publish('', QUEUES.EMAIL_REQUEST, content, {
      persistent: true,
      contentType: 'application/json',
      correlationId: input.correlationId,
    });
  }
}
