import type { PrismaClient } from '@prisma/client';
import type { ForecastJobRecord, ForecastRepository } from '../../composition/ports.js';

const CATALOG_VERSION = process.env.MODEL_CATALOG_VERSION ?? '2026.08';

function toRecord(j: {
  id: string;
  scenarioId: string;
  status: string;
  inputUri: string | null;
  outputUri: string | null;
  seriesOutputUri: string | null;
  parametersSnapshot: unknown;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
  failureReason: string | null;
}): ForecastJobRecord {
  const snap = j.parametersSnapshot as {
    horizonMonths?: number;
    accuracyMetric?: string;
    modelPackage?: string;
  };

  return {
    id: j.id,
    scenarioId: j.scenarioId,
    status: j.status as ForecastJobRecord['status'],
    objectUri: j.inputUri ?? '',
    resultOutputUri: j.outputUri ?? null,
    resultSeriesUri: j.seriesOutputUri ?? null,
    horizonMonths: snap?.horizonMonths ?? 12,
    accuracyMetric: snap?.accuracyMetric ?? 'WMAPE',
    modelPackage: snap?.modelPackage ?? 'STANDARD',
    createdAt: j.createdAt.toISOString(),
    startedAt: j.startedAt?.toISOString() ?? null,
    finishedAt: j.finishedAt?.toISOString() ?? null,
    failureReason: j.failureReason,
  };
}

export class PrismaForecastRepository implements ForecastRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: {
    scenarioId: string;
    objectUri: string;
    horizonMonths: number;
    accuracyMetric: string;
    modelPackage: string;
    correlationId: string;
    requestedById?: string;
  }): Promise<ForecastJobRecord> {
    // requestedById é obrigatório no schema — fallback para o criador do cenário
    const requestedById: string = input.requestedById ??
      await this.prisma.scenario
        .findUnique({ where: { id: input.scenarioId }, select: { createdById: true } })
        .then((s) => s?.createdById ?? '');

    const j = await this.prisma.forecastJob.create({
      data: {
        scenarioId: input.scenarioId,
        inputUri: input.objectUri,
        requestedById,
        correlationId: input.correlationId,
        modelCatalogVersion: CATALOG_VERSION,
        parametersSnapshot: {
          horizonMonths: input.horizonMonths,
          accuracyMetric: input.accuracyMetric,
          modelPackage: input.modelPackage,
        },
      },
    });

    return toRecord(j);
  }

  async findActiveByScenario(scenarioId: string): Promise<ForecastJobRecord | null> {
    const j = await this.prisma.forecastJob.findFirst({
      where: {
        scenarioId,
        status: { in: ['PENDING', 'PROCESSING'] },
      },
      orderBy: { createdAt: 'desc' },
    });
    return j ? toRecord(j) : null;
  }

  async findById(id: string): Promise<ForecastJobRecord | null> {
    const j = await this.prisma.forecastJob.findUnique({ where: { id } });
    return j ? toRecord(j) : null;
  }

  async updateResult(
    id: string,
    result: {
      status: 'COMPLETED' | 'FAILED';
      resultOutputUri?: string;
      resultSeriesUri?: string;
      failureReason?: string;
    },
  ): Promise<void> {
    await this.prisma.forecastJob.update({
      where: { id },
      data: {
        status: result.status,
        outputUri: result.resultOutputUri ?? null,
        seriesOutputUri: result.resultSeriesUri ?? null,
        failureReason: result.failureReason ?? null,
        finishedAt: new Date(),
      },
    });
  }
}
