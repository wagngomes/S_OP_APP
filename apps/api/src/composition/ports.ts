import type { FastifyServerOptions } from 'fastify';
import type { MemberRole } from '@sop/domain';
export type { MemberRole };

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

/** Resultado de autenticação devolvido pelas rotas de auth. */
export type AuthedUser = { id: string; email: string; name: string };

/**
 * Porta de autenticação (FR-001 a FR-004).
 *
 * As rotas de auth dependem desta abstração; o adaptador concreto é BetterAuth.
 * A separação permite exercitar as rotas com um fake sem banco (Princípio IV).
 */
export type AuthPort = {
  signUp(
    body: { name: string; email: string; password: string },
    requestHeaders: Headers,
  ): Promise<{ user: AuthedUser; setCookies: string[] }>;

  signIn(
    body: { email: string; password: string },
    requestHeaders: Headers,
  ): Promise<{ user: AuthedUser; setCookies: string[] }>;

  signOut(requestHeaders: Headers): Promise<{ setCookies: string[] }>;

  getSession(requestHeaders: Headers): Promise<{ user: AuthedUser | null }>;
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

  /** Avança a fase do cenário quando a condição for satisfeita. */
  transitionPhase(
    scenarioId: string,
    from: ScenarioRecord['phase'],
    to: ScenarioRecord['phase'],
  ): Promise<void>;

  /** FR-013 — marca a equipe como fechada. */
  setTeamClosed(scenarioId: string): Promise<void>;
};

// --- Membros -----------------------------------------------------------------

export type ScenarioMemberRecord = {
  id: string;
  scenarioId: string;
  userId: string | null;
  invitedEmail: string;
  role: MemberRole;
  collaborationDoneAt: string | null;
  createdAt: string;
};

export type MembershipRepository = {
  /** FR-009 — convida por e-mail; vínculo de conta ocorre depois do cadastro. */
  invite(input: {
    scenarioId: string;
    invitedEmail: string;
    role: MemberRole;
  }): Promise<ScenarioMemberRecord>;

  listMembers(scenarioId: string): Promise<ScenarioMemberRecord[]>;

  getRolesForUser(scenarioId: string, userId: string): Promise<MemberRole[]>;

  hasApprover(scenarioId: string): Promise<boolean>;
};

// --- Notificação -------------------------------------------------------------

export type NotificationPort = {
  /** FR-053 — notifica aprovadores quando o cálculo termina. */
  notifyForecastReady(input: {
    scenarioId: string;
    scenarioName: string;
    approverEmails: string[];
    correlationId: string;
  }): Promise<void>;
};

// --- Ingestão -----------------------------------------------------------------

export type IngestionJobRecord = {
  id: string;
  scenarioId: string;
  kind: 'SALES_HISTORY' | 'COLLABORATION_SHEET' | 'ACTUAL_SALES';
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  objectUri: string;
  declaredLabels: string[];
  totalRows: number;
  validRows: number;
  invalidRows: number;
  issueCount: number;
  issueCapReached: boolean;
  correlationId: string;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  failureReason: string | null;
};

export type IngestionIssueRecord = {
  id: string;
  jobId: string;
  lineNumber: number;
  column: string | null;
  code: string;
  detail: string;
};

export type IngestionRepository = {
  create(input: {
    scenarioId: string;
    kind: string;
    objectUri: string;
    declaredLabels: string[];
    uploadedById: string;
    correlationId: string;
  }): Promise<IngestionJobRecord>;

  findById(id: string): Promise<IngestionJobRecord | null>;

  listIssues(
    jobId: string,
    page: { limit: number; offset: number },
  ): Promise<{ data: IngestionIssueRecord[]; total: number }>;
};

// --- Forecast -----------------------------------------------------------------

export type ForecastJobRecord = {
  id: string;
  scenarioId: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  /** URI do dataset Parquet exportado antes do cálculo (D5). */
  objectUri: string;
  /** URI do output.parquet escrito pelo motor (null até completar). */
  resultOutputUri: string | null;
  /** URI do series.parquet escrito pelo motor (null até completar). */
  resultSeriesUri: string | null;
  horizonMonths: number;
  accuracyMetric: string;
  modelPackage: string;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  failureReason: string | null;
};

export type ForecastRepository = {
  create(input: {
    scenarioId: string;
    objectUri: string;
    horizonMonths: number;
    accuracyMetric: string;
    modelPackage: string;
    correlationId: string;
    /** Quem solicitou o cálculo — obrigatório no Prisma, opcional para fakes. */
    requestedById?: string;
  }): Promise<ForecastJobRecord>;

  /** FR-051 — retorna o job ativo (PENDING ou PROCESSING) se existir. */
  findActiveByScenario(scenarioId: string): Promise<ForecastJobRecord | null>;

  findById(id: string): Promise<ForecastJobRecord | null>;

  updateResult(
    id: string,
    result: {
      status: 'COMPLETED' | 'FAILED';
      resultOutputUri?: string;
      resultSeriesUri?: string;
      failureReason?: string;
    },
  ): Promise<void>;
};

/** Exporta o histórico do cenário como Parquet para o MinIO (D5). */
export type DatasetExporter = {
  exportHistory(scenarioId: string, outputUri: string): Promise<void>;
};

// --- ForecastItem / ForecastSeriesResult -------------------------------------

export type ForecastItemInput = {
  productCode: string;
  segments: string[];
  seriesKey: string;
  year: number;
  month: number;
  /** String decimal (Princípio V). */
  calculatedQuantity: string;
};

export type ForecastSeriesInput = {
  seriesKey: string;
  winningModel: string;
  metricValue: string | null;
  evaluatedModels: string[];
  excludedModels: string[];
  backtestWindowsUsed: number;
  fallbackApplied: boolean;
};

export type ForecastItemRepository = {
  bulkCreateItems(jobId: string, scenarioId: string, items: ForecastItemInput[]): Promise<void>;
  bulkCreateSeries(jobId: string, series: ForecastSeriesInput[]): Promise<void>;
  listItems(
    jobId: string,
    page: { limit: number; offset: number },
  ): Promise<{ data: ForecastItemInput[]; total: number }>;
  listSeries(
    jobId: string,
    page: { limit: number; offset: number },
  ): Promise<{ data: ForecastSeriesInput[]; total: number }>;
};

/** Lê Parquet do MinIO e devolve os registros já tipados. */
export type ParquetReader = {
  readItems(uri: string): Promise<ForecastItemInput[]>;
  readSeries(uri: string): Promise<ForecastSeriesInput[]>;
};

// --- Colaboração -------------------------------------------------------------

export type CollaborationAdjustmentRecord = {
  id: string;
  scenarioId: string;
  forecastItemId: string;
  authorId: string;
  /** Decimal string (Princípio V). */
  quantity: string;
  reason: string;
  origin: 'UI' | 'SPREADSHEET';
  supersededById: string | null;
  createdAt: string;
};

export type CollaborationItemRecord = {
  id: string;
  productCode: string;
  segments: string[];
  year: number;
  month: number;
  /** Previsão calculada — imutável (Princípio II). */
  calculatedQuantity: string;
  currentAdjustment: CollaborationAdjustmentRecord | null;
  /** Contador de ajustes para detecção de concorrência (FR-066b). */
  version: number;
};

export type CollaborationRepository = {
  createAdjustment(input: {
    scenarioId: string;
    forecastItemId: string;
    authorId: string;
    quantity: string;
    reason: string;
    origin: 'UI' | 'SPREADSHEET';
  }): Promise<CollaborationAdjustmentRecord>;

  listItemsWithAdjustments(
    scenarioId: string,
    page: { limit: number; offset: number },
  ): Promise<{ data: CollaborationItemRecord[]; total: number }>;

  findForecastItem(forecastItemId: string): Promise<{ id: string; scenarioId: string } | null>;

  versionFor(forecastItemId: string): Promise<number>;

  markDone(scenarioId: string, userId: string): Promise<void>;

  allCollaboratorsDone(scenarioId: string): Promise<boolean>;

  pendingCollaborators(
    scenarioId: string,
  ): Promise<{ userId: string | null; invitedEmail: string }[]>;
};

/** Dependências que o `buildApp` recebe. */
export type AppDependencies = {
  health: HealthChecks;
  /** Identifica o usuário da sessão — usada pelas rotas de negócio. */
  auth?: Authenticator;
  /** Implementa sign-up, sign-in, sign-out e get-session. */
  authPort?: AuthPort;
  ingestion?: IngestionRepository;
  forecast?: ForecastRepository;
  forecastItems?: ForecastItemRepository;
  scenarios?: ScenarioRepository;
  publisher?: JobPublisher;
  datasets?: DatasetStore;
  datasetExporter?: DatasetExporter;
  parquet?: ParquetReader;
  membership?: MembershipRepository;
  notification?: NotificationPort;
  collaboration?: CollaborationRepository;
  /** Sobrescreve o logger — usado nos testes para capturar o que foi emitido. */
  logger?: FastifyServerOptions['logger'];
};
