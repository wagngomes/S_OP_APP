import { Resend } from 'resend';
import type { EmailSenderPort } from '../composition/ports.js';

/**
 * Adaptador Resend (D12).
 *
 * API key via `RESEND_API_KEY`. `from` padrão sobrescrito por `EMAIL_FROM`.
 * Lança se `id` estiver ausente na resposta (indica falha silenciosa do SDK).
 */
export class ResendEmailSender implements EmailSenderPort {
  private readonly resend: Resend;
  private readonly from: string;

  constructor(apiKey: string, from: string) {
    this.resend = new Resend(apiKey);
    this.from = from;
  }

  async send(input: { to: string; subject: string; html: string }): Promise<string> {
    const { data, error } = await this.resend.emails.send({
      from: this.from,
      to: input.to,
      subject: input.subject,
      html: input.html,
    });

    if (error || !data?.id) {
      throw new Error(error?.message ?? 'Resend não retornou um id');
    }

    return data.id;
  }
}
