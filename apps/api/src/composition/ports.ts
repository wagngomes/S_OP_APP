import type { FastifyServerOptions } from 'fastify';

/**
 * Portas da API (Princípio IV).
 *
 * Os services dependem destas abstrações, nunca de implementações concretas.
 * É o que permite exercitar o servidor inteiro com implementações falsas — e é
 * por isso que estes testes rodam sem banco, sem fila e sem Docker.
 *
 * Os adaptadores concretos (Prisma, RabbitMQ, MinIO, Resend) são montados em
 * `composition/container.ts` e injetados no `buildApp`.
 */

/** Verificações de saúde das dependências externas. */
export type HealthChecks = {
  checkDatabase(): Promise<boolean>;
  checkBroker(): Promise<boolean>;
  checkObjectStore(): Promise<boolean>;
};

/** Publica a referência de um job numa fila (D5: referência, nunca dataset). */
export type JobPublisher = {
  publish(queue: string, payload: unknown, correlationId: string): Promise<void>;
};

/** Guarda e recupera datasets e uploads. */
export type DatasetStore = {
  putStream(uri: string, stream: NodeJS.ReadableStream): Promise<void>;
  presignGet(uri: string, expiresInSeconds: number): Promise<string>;
};

/** Dependências que o `buildApp` recebe. */
export type AppDependencies = {
  health: HealthChecks;
  publisher?: JobPublisher;
  datasets?: DatasetStore;
  /** Sobrescreve o logger — usado nos testes para capturar o que foi emitido. */
  logger?: FastifyServerOptions['logger'];
};
