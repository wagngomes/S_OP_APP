import { z } from 'zod';

/**
 * Envelope comum de TODA mensagem, em TODAS as filas.
 *
 * `correlationId` é obrigatório desde a v1 (Princípio IX): sem ele, seguir um
 * cálculo atravessando API, worker e motor vira arqueologia de timestamp.
 *
 * Ver: specs/001-sop-cycle-forecasting/contracts/messaging.md
 */

/** Tipos de mensagem reconhecidos na v1 do contrato. */
export const MessageType = z.enum([
  'ingestion.request',
  'forecast.request',
  'forecast.result',
  'accuracy.request',
  'accuracy.result',
  'email.request',
]);
export type MessageType = z.infer<typeof MessageType>;

/** Versão corrente do contrato de mensageria. */
export const MESSAGING_VERSION = 1;

const uuid = z.string().uuid();

/**
 * Envelope genérico. O payload é validado pelo schema específico de cada tipo,
 * passado como parâmetro — o envelope não sabe o que carrega.
 */
export function Envelope<T extends z.ZodTypeAny>(payload: T) {
  return z.object({
    messageId: uuid,
    correlationId: uuid,
    occurredAt: z.iso.datetime(),
    version: z.literal(MESSAGING_VERSION),
    type: MessageType,
    payload,
  });
}

/** Envelope sem tipagem do payload, para inspeção antes do roteamento. */
export const AnyEnvelope = Envelope(z.unknown());
export type AnyEnvelope = z.infer<typeof AnyEnvelope>;

/** URI de objeto no armazenamento — nunca o dado em si (D5). */
export const ObjectUri = z
  .string()
  .regex(/^s3:\/\/[a-z0-9.\-]+\/.+$/, 'esperado um URI s3://bucket/caminho');

/** Chave de idempotência do consumidor: o job é a unidade de deduplicação (D6). */
export const JobReference = z.object({
  jobId: uuid,
  scenarioId: uuid,
});
export type JobReference = z.infer<typeof JobReference>;
