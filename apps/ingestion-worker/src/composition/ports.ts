/**
 * Portas do ingestion-worker (Princípio IV).
 *
 * Os módulos de aplicação dependem destas abstrações; os adaptadores concretos
 * (Prisma, MinIO/S3) são montados no bootstrap e injetados nos consumers.
 */

// --- Histórico ---------------------------------------------------------------

export type RawSalesRow = {
  productCode: string;
  segments: string[];
  year: number;
  month: number;
  /** String decimal — nunca `number` (Princípio V). */
  quantity: string;
};

export type SalesHistoryPort = {
  /** Insere os registros deduplicated do CSV no banco. */
  bulkCreateSalesRecords(scenarioId: string, rows: RawSalesRow[]): Promise<void>;
  /** Verifica e atualiza os níveis de segmentação para o cenário. */
  ensureLevels(scenarioId: string, labels: string[]): Promise<void>;
};

// --- Issues ------------------------------------------------------------------

export type IssueRow = {
  lineNumber: number;
  column?: string;
  code: string;
  detail: string;
};

export type IssuePort = {
  bulkCreateIssues(jobId: string, issues: IssueRow[]): Promise<void>;
};

// --- Job de ingestão ---------------------------------------------------------

export type JobPort = {
  /** Marca o job como PROCESSING e registra startedAt. */
  startJob(jobId: string): Promise<void>;

  /** Marca o job como COMPLETED com os contadores finais. */
  completeJob(
    jobId: string,
    stats: {
      totalRows: number;
      validRows: number;
      invalidRows: number;
      issueCount: number;
      issueCapReached: boolean;
    },
  ): Promise<void>;

  /** Marca o job como FAILED com o motivo. */
  failJob(jobId: string, reason: string): Promise<void>;
};

// --- Object store (leitura do CSV do MinIO) ----------------------------------

export type ObjectStorePort = {
  getStream(uri: string): Promise<NodeJS.ReadableStream>;
};

// --- Colaboração (planilha devolvida) ----------------------------------------

export type CollaborationSheetItem = {
  id: string;
  scenarioId: string;
  calculatedQuantity: string;
  /** authorId do ajuste atual; null se nenhum ajuste ainda. */
  currentAdjustmentAuthorId: string | null;
};

export type CollaborationPort = {
  findItemsByIds(
    scenarioId: string,
    forecastItemIds: string[],
  ): Promise<Map<string, CollaborationSheetItem>>;

  createAdjustment(input: {
    scenarioId: string;
    forecastItemId: string;
    authorId: string;
    quantity: string;
    reason: string;
    origin: 'SPREADSHEET';
  }): Promise<void>;
};

// --- Conjunto de ports injetado nos handlers ---------------------------------

export type IngestionWorkerPorts = {
  history: SalesHistoryPort;
  issues: IssuePort;
  job: JobPort;
  objectStore: ObjectStorePort;
  collaboration?: CollaborationPort;
};
