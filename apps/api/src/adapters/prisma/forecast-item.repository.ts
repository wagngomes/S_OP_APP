import type { PrismaClient } from '@prisma/client';
import type {
  ForecastItemInput,
  ForecastItemRepository,
  ForecastSeriesInput,
} from '../../composition/ports.js';

export class PrismaForecastItemRepository implements ForecastItemRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async bulkCreateItems(
    jobId: string,
    scenarioId: string,
    items: ForecastItemInput[],
  ): Promise<void> {
    if (items.length === 0) return;

    await this.prisma.forecastItem.createMany({
      data: items.map((item) => ({
        jobId,
        scenarioId,
        productCode: item.productCode,
        segments: item.segments,
        seriesKey: item.seriesKey,
        year: item.year,
        month: item.month,
        calculatedQuantity: item.calculatedQuantity,
      })),
      skipDuplicates: true,
    });
  }

  async bulkCreateSeries(jobId: string, series: ForecastSeriesInput[]): Promise<void> {
    if (series.length === 0) return;

    await this.prisma.forecastSeriesResult.createMany({
      data: series.map((s) => ({
        jobId,
        seriesKey: s.seriesKey,
        winningModel: s.winningModel,
        metricValue: s.metricValue ?? '0',
        evaluatedModels: s.evaluatedModels,
        excludedModels: s.excludedModels,
        backtestWindowsUsed: s.backtestWindowsUsed,
        fallbackApplied: s.fallbackApplied,
      })),
      skipDuplicates: true,
    });
  }

  async listItems(
    jobId: string,
    page: { limit: number; offset: number },
  ): Promise<{ data: ForecastItemInput[]; total: number }> {
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.forecastItem.findMany({
        where: { jobId },
        orderBy: [{ year: 'asc' }, { month: 'asc' }, { productCode: 'asc' }],
        skip: page.offset,
        take: page.limit,
      }),
      this.prisma.forecastItem.count({ where: { jobId } }),
    ]);

    const data: ForecastItemInput[] = rows.map((r) => ({
      productCode: r.productCode,
      segments: r.segments,
      seriesKey: r.seriesKey,
      year: r.year,
      month: r.month,
      calculatedQuantity: r.calculatedQuantity.toString(),
    }));

    return { data, total };
  }

  async listSeries(
    jobId: string,
    page: { limit: number; offset: number },
  ): Promise<{ data: ForecastSeriesInput[]; total: number }> {
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.forecastSeriesResult.findMany({
        where: { jobId },
        skip: page.offset,
        take: page.limit,
      }),
      this.prisma.forecastSeriesResult.count({ where: { jobId } }),
    ]);

    const data: ForecastSeriesInput[] = rows.map((r) => ({
      seriesKey: r.seriesKey,
      winningModel: r.winningModel,
      metricValue: r.metricValue?.toString() ?? null,
      evaluatedModels: r.evaluatedModels as string[],
      excludedModels: (r.excludedModels as string[]) ?? [],
      backtestWindowsUsed: r.backtestWindowsUsed,
      fallbackApplied: r.fallbackApplied,
    }));

    return { data, total };
  }
}
