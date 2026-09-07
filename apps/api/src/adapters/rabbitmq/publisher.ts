import type { Channel } from 'amqplib';
import type { JobPublisher } from '../../composition/ports.js';

/**
 * Publica mensagens em filas RabbitMQ (D5: referência, nunca dataset).
 *
 * O canal é passado de fora — o ciclo de vida da conexão é responsabilidade
 * de quem monta o container (server.ts), não deste adaptador.
 */
export class RabbitMQPublisher implements JobPublisher {
  constructor(private readonly channel: Channel) {}

  async publish(queue: string, payload: unknown, correlationId: string): Promise<void> {
    const content = Buffer.from(JSON.stringify(payload));
    this.channel.publish('', queue, content, {
      persistent: true,
      contentType: 'application/json',
      correlationId,
      headers: { 'x-sop-retry-count': 0 },
    });
  }
}
