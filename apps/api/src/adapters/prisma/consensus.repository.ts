import type { PrismaClient } from '@prisma/client';
import type {
  ConsensusDecisionRecord,
  ConsensusItemRecord,
  ConsensusRepository,
  PublishedForecastRecord,
} from '../../composition/ports.js';

function toDecisionRecord(d: {
  id: string;
  forecastItemId: string;
  decidedById: string;
  source: string;
  quantity: { toFixed: (n: number) => string };
  reason: string | null;
  decidedAt: Date;
}): ConsensusDecisionRecord {
  return {
    id: d.id,
    forecastItemId: d.forecastItemId,
    decidedById: d.decidedById,
    source: d.source as ConsensusDecisionRecord['source'],
    quantity: d.quantity.toFixed(6),
    reason: d.reason,
    decidedAt: d.decidedAt.toISOString(),
  };
}

export class PrismaConsensusRepository implements ConsensusRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listItemsForConsensus(
    scenarioId: string,
    page: { limit: number; offset: number },
  ): Promise<{ data: ConsensusItemRecord[]; total: number }> {
    const job = await this.prisma.forecastJob.findFirst({
      where: { scenarioId, status: 'COMPLETED' },
      orderBy: { createdAt: 'desc' },
    });

    if (!job) return { data: [], total: 0 };

    const [total, items] = await Promise.all([
      this.prisma.forecastItem.count({ where: { jobId: job.id } }),
      this.prisma.forecastItem.findMany({
        where: { jobId: job.id },
        orderBy: [{ year: 'asc' }, { month: 'asc' }, { productCode: 'asc' }],
        skip: page.offset,
        take: page.limit,
        include: {
          adjustments: { orderBy: { createdAt: 'asc' } },
          decision: true,
        },
      }),
    ]);

    const data: ConsensusItemRecord[] = items.map((item) => {
      const currentAdj = item.adjustments.find((a) => a.supersededById === null) ?? null;
      return {
        id: item.id,
        productCode: item.productCode,
        segments: item.segments,
        year: item.year,
        month: item.month,
        calculatedQuantity: item.calculatedQuantity.toFixed(6),
        collaboratedQuantity: currentAdj?.quantity.toFixed(6) ?? null,
        currentDecision: item.decision ? toDecisionRecord(item.decision) : null,
      };
    });

    return { data, total };
  }

  async createDecision(input: {
    forecastItemId: string;
    decidedById: string;
    source: 'CALCULATED' | 'COLLABORATED' | 'MANUAL';
    quantity: string;
    reason?: string;
    calculatedQuantity: string;
    collaboratedQuantity: string | null;
  }): Promise<ConsensusDecisionRecord> {
    const Decimal = (await import('decimal.js')).default;
    const calc = new Decimal(input.calculatedQuantity);
    const collab = input.collaboratedQuantity !== null ? new Decimal(input.collaboratedQuantity) : calc;
    const qty = new Decimal(input.quantity);

    const deltaToCalculated = qty.minus(calc);
    const deltaToCollaborated = qty.minus(collab);

    const d = await this.prisma.consensusDecision.upsert({
      where: { forecastItemId: input.forecastItemId },
      create: {
        forecastItemId: input.forecastItemId,
        decidedById: input.decidedById,
        source: input.source,
        quantity: input.quantity,
        reason: input.reason ?? null,
        deltaToCalculated: deltaToCalculated.toFixed(6),
        deltaToCollaborated: deltaToCollaborated.toFixed(6),
      },
      update: {
        decidedById: input.decidedById,
        source: input.source,
        quantity: input.quantity,
        reason: input.reason ?? null,
        deltaToCalculated: deltaToCalculated.toFixed(6),
        deltaToCollaborated: deltaToCollaborated.toFixed(6),
      },
    });

    return toDecisionRecord(d);
  }

  async allItemsDecided(scenarioId: string): Promise<boolean> {
    const job = await this.prisma.forecastJob.findFirst({
      where: { scenarioId, status: 'COMPLETED' },
      orderBy: { createdAt: 'desc' },
    });
    if (!job) return false;

    const totalItems = await this.prisma.forecastItem.count({ where: { jobId: job.id } });
    if (totalItems === 0) return false;

    const decidedItems = await this.prisma.forecastItem.count({
      where: { jobId: job.id, decision: { isNot: null } },
    });

    return totalItems === decidedItems;
  }

  async publishForecast(scenarioId: string): Promise<void> {
    const job = await this.prisma.forecastJob.findFirst({
      where: { scenarioId, status: 'COMPLETED' },
      orderBy: { createdAt: 'desc' },
    });
    if (!job) return;

    const items = await this.prisma.forecastItem.findMany({
      where: { jobId: job.id },
      include: { decision: true },
    });

    await this.prisma.$transaction([
      // Delete existing published records for this scenario (re-publish overrides)
      this.prisma.publishedForecast.deleteMany({ where: { scenarioId } }),
      // Create new published records from decisions
      this.prisma.publishedForecast.createMany({
        data: items.map((item) => ({
          scenarioId,
          forecastItemId: item.id,
          quantity: item.decision?.quantity ?? item.calculatedQuantity,
        })),
      }),
    ]);
  }

  async listPublished(
    scenarioId: string,
    page: { limit: number; offset: number },
  ): Promise<{ data: PublishedForecastRecord[]; total: number }> {
    const [total, rows] = await Promise.all([
      this.prisma.publishedForecast.count({ where: { scenarioId } }),
      this.prisma.publishedForecast.findMany({
        where: { scenarioId },
        orderBy: [{ forecastItem: { year: 'asc' } }, { forecastItem: { month: 'asc' } }, { forecastItem: { productCode: 'asc' } }],
        skip: page.offset,
        take: page.limit,
        include: {
          forecastItem: {
            select: { productCode: true, segments: true, year: true, month: true },
          },
        },
      }),
    ]);

    const data: PublishedForecastRecord[] = rows.map((r) => ({
      id: r.id,
      forecastItemId: r.forecastItemId,
      productCode: r.forecastItem.productCode,
      segments: r.forecastItem.segments,
      year: r.forecastItem.year,
      month: r.forecastItem.month,
      quantity: r.quantity.toFixed(6),
      publishedAt: r.publishedAt.toISOString(),
    }));

    return { data, total };
  }
}
