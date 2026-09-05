import type { $Enums, Prisma } from '@prisma/client';

/**
 * Parâmetros para registrar um evento de auditoria.
 *
 * O `tx` é um cliente de transação Prisma — a gravação acontece na MESMA
 * transação da alteração que originou o evento (FR-099, FR-100).
 */
export type AuditEventInput = {
  tx: Prisma.TransactionClient;
  scenarioId: string;
  entityType: string;
  entityId: string;
  action: $Enums.AuditAction;
  actorId?: string | null;
  origin: $Enums.AuditOrigin;
  correlationId: string;
  /** Qualquer objeto JSON serializável; guardado como JSONB no Postgres. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload?: Record<string, any>;
};

/**
 * Grava um AuditEvent dentro da transação do chamador (FR-099, FR-100).
 *
 * Nunca chame fora de um bloco `prisma.$transaction(...)` — o propósito
 * deste helper é garantir que a trilha de auditoria e a alteração de negócio
 * sejam atômicas: se um rollback ocorrer, o evento some junto.
 */
export async function writeAuditEvent({
  tx,
  scenarioId,
  entityType,
  entityId,
  action,
  actorId,
  origin,
  correlationId,
  payload,
}: AuditEventInput): Promise<void> {
  await tx.auditEvent.create({
    data: {
      scenarioId,
      entityType,
      entityId,
      action,
      actorId: actorId ?? null,
      origin,
      correlationId,
      ...(payload !== undefined ? { payload } : {}),
    },
  });
}
