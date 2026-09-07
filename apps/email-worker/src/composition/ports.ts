/**
 * Portas do email-worker (Princípio IV).
 *
 * `EmailSenderPort` — envia o e-mail via provedor externo (Resend em prod).
 * `NotificationStatusPort` — actualiza o registo `EmailNotification` no banco.
 */

export type EmailSenderPort = {
  /**
   * Envia um e-mail e retorna o `messageId` do provedor.
   * Lança em caso de falha (a camada de retry trata a exceção).
   */
  send(input: {
    to: string;
    subject: string;
    html: string;
  }): Promise<string>;
};

export type NotificationStatusPort = {
  incrementAttempt(notificationId: string): Promise<void>;
  markSent(notificationId: string, providerMessageId: string): Promise<void>;
  markFailed(notificationId: string, error: string): Promise<void>;
};

export type EmailWorkerPorts = {
  sender: EmailSenderPort;
  status: NotificationStatusPort;
};
