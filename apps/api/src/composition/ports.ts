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

/** Identidade do requisitante. A autorização de processo é do domínio (D8). */
export type Authenticator = {
  currentUser(headers: Record<string, string | string[] | undefined>): Promise<{ id: string } | null>;
};

// --- Registros de leitura ----------------------------------------------------

export type ScenarioRecord = {
  id: string;
  name: string;
  phase:
    | 'TEAM_SETUP'
    | 'IMPORT_SETUP'
    | 'CALCULATION'
    | 'APPROVAL'
    | 'COLLABORATION'
    | 'CONSENSUS'
    | 'PUBLICATION'
    | 'ACCURACY';
  createdById: string;
  finalSayRole: 'CREATOR' | 'APPROVER';
  teamClosedAt: string | null;
  forecastHorizonMonths: number;
  publishedAt: string | null;
  createdAt: string;
};

export type SegmentationLevelRecord = {
  id: string;
  position: number;
  label: string;
};

export type ParametersRecord = {
  groupingLevelIds: string[];
  prorationMonths: number;
  accuracyMetric: 'WMAPE' | 'MAPE' | 'BIAS';
  modelPackage: 'FAST' | 'STANDARD' | 'COMPLETE';
  horizonMonths: number;
};

/** Estatísticas do histórico usadas na validação e na prévia de custo. */
export type HistoryStats = {
  availableHistoryMonths: number;
  /** Proporção de meses com realizado zero, entre 0 e 1 (FR-036a). */
  zeroMonthProportion: number;
};

export type ScenarioRepository = {
  create(input: {
    name: string;
    createdById: string;
    finalSayRole: 'CREATOR' | 'APPROVER';
    forecastHorizonMonths: number;
  }): Promise<ScenarioRecord>;

  findById(id: string): Promise<ScenarioRecord | null>;

  /** FR-005 — só participantes enxergam o cenário. */
  isMember(scenarioId: string, userId: string): Promise<boolean>;

  listForUser(
    userId: string,
    page: { limit: number; offset: number },
  ): Promise<{ data: ScenarioRecord[]; total: number }>;

  listLevels(scenarioId: string): Promise<SegmentationLevelRecord[]>;

  getParameters(scenarioId: string): Promise<ParametersRecord | null>;
  saveParameters(scenarioId: string, params: ParametersRecord): Promise<void>;

  historyStats(scenarioId: string): Promise<HistoryStats>;

  /** FR-034a — `COUNT(DISTINCT)` sobre o histórico já persistido (D1a). */
  countDistinctSeries(scenarioId: string, levelIds: string[]): Promise<number>;
};

/** Dependências que o `buildApp` recebe. */
export type AppDependencies = {
  health: HealthChecks;
  auth?: Authenticator;
  scenarios?: ScenarioRepository;
  publisher?: JobPublisher;
  datasets?: DatasetStore;
  /** Sobrescreve o logger — usado nos testes para capturar o que foi emitido. */
  logger?: FastifyServerOptions['logger'];
};
