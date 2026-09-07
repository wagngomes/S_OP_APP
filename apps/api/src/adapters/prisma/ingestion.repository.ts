import type { PrismaClient } from '@prisma/client';
import type {
  IngestionIssueRecord,
  IngestionJobRecord,
  IngestionRepository,
} from '../../composition/ports.js';

function toJobRecord(j: {
  id: string;
  scenarioId: string;
  kind: string;
  status: string;
  objectUri: string;
  declaredLabels: string[];
  totalRows: number;
  validRows: number;
  invalidRows: number;
  issueCount: number;
  issueCapReached: boolean;
  correlationId: string;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
  failureReason: string | null;
}): IngestionJobRecord {
  return {
    id: j.id,
    scenarioId: j.scenarioId,
    kind: j.kind as IngestionJobRecord['kind'],
    status: j.status as IngestionJobRecord['status'],
    objectUri: j.objectUri,
    declaredLabels: j.declaredLabels,
    totalRows: j.totalRows,
    validRows: j.validRows,
    invalidRows: j.invalidRows,
    issueCount: j.issueCount,
    issueCapReached: j.issueCapReached,
    correlationId: j.correlationId,
    createdAt: j.createdAt.toISOString(),
    startedAt: j.startedAt?.toISOString() ?? null,
    finishedAt: j.finishedAt?.toISOString() ?? null,
    failureReason: j.failureReason,
  };
}

export class PrismaIngestionRepository implements IngestionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: {
    scenarioId: string;
    kind: string;
    objectUri: string;
    declaredLabels: string[];
    uploadedById: string;
    correlationId: string;
  }): Promise<IngestionJobRecord> {
    const j = await this.prisma.ingestionJob.create({
      data: {
        scenarioId: input.scenarioId,
        kind: input.kind as never,
        objectUri: input.objectUri,
        declaredLabels: input.declaredLabels,
        uploadedById: input.uploadedById,
        correlationId: input.correlationId,
      },
    });
    return toJobRecord(j);
  }

  async findById(id: string): Promise<IngestionJobRecord | null> {
    const j = await this.prisma.ingestionJob.findUnique({ where: { id } });
    return j ? toJobRecord(j) : null;
  }

  async listIssues(
    jobId: string,
    page: { limit: number; offset: number },
  ): Promise<{ data: IngestionIssueRecord[]; total: number }> {
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.ingestionIssue.findMany({
        where: { jobId },
        orderBy: { lineNumber: 'asc' },
        skip: page.offset,
        take: page.limit,
      }),
      this.prisma.ingestionIssue.count({ where: { jobId } }),
    ]);

    const data: IngestionIssueRecord[] = rows.map((r) => ({
      id: r.id,
      jobId: r.jobId,
      lineNumber: r.lineNumber,
      column: r.column,
      code: r.code,
      detail: r.detail,
    }));

    return { data, total };
  }
}
