import type { PrismaClient } from '@prisma/client';
import type { CollaborationAdjustmentRecord, CollaborationItemRecord, CollaborationRepository } from '../../composition/ports.js';

function toAdjRecord(a: {
  id: string;
  scenarioId: string;
  forecastItemId: string;
  authorId: string;
  quantity: { toFixed: (n: number) => string };
  reason: string;
  origin: 'UI' | 'SPREADSHEET';
  supersededById: string | null;
  createdAt: Date;
}): CollaborationAdjustmentRecord {
  return {
    id: a.id,
    scenarioId: a.scenarioId,
    forecastItemId: a.forecastItemId,
    authorId: a.authorId,
    quantity: a.quantity.toFixed(6),
    reason: a.reason,
    origin: a.origin,
    supersededById: a.supersededById,
    createdAt: a.createdAt.toISOString(),
  };
}

export class PrismaCollaborationRepository implements CollaborationRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async createAdjustment(input: {
    scenarioId: string;
    forecastItemId: string;
    authorId: string;
    quantity: string;
    reason: string;
    origin: 'UI' | 'SPREADSHEET';
  }): Promise<CollaborationAdjustmentRecord> {
    return this.prisma.$transaction(async (tx) => {
      // Find the current (non-superseded) adjustment for this item, if any
      const current = await tx.collaborationAdjustment.findFirst({
        where: { forecastItemId: input.forecastItemId, supersededById: null },
      });

      const newAdj = await tx.collaborationAdjustment.create({
        data: {
          scenarioId: input.scenarioId,
          forecastItemId: input.forecastItemId,
          authorId: input.authorId,
          quantity: input.quantity,
          reason: input.reason,
          origin: input.origin as 'UI' | 'SPREADSHEET',
        },
      });

      if (current) {
        await tx.collaborationAdjustment.update({
          where: { id: current.id },
          data: { supersededById: newAdj.id },
        });
      }

      return toAdjRecord({ ...newAdj, origin: newAdj.origin as 'UI' | 'SPREADSHEET' });
    });
  }

  async listItemsWithAdjustments(
    scenarioId: string,
    page: { limit: number; offset: number },
  ): Promise<{ data: CollaborationItemRecord[]; total: number }> {
    // Get the latest completed forecast job for this scenario
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
          adjustments: {
            orderBy: { createdAt: 'asc' },
          },
        },
      }),
    ]);

    const data: CollaborationItemRecord[] = items.map((item) => {
      const current = item.adjustments.find((a) => a.supersededById === null) ?? null;
      return {
        id: item.id,
        productCode: item.productCode,
        segments: item.segments,
        year: item.year,
        month: item.month,
        calculatedQuantity: item.calculatedQuantity.toFixed(6),
        currentAdjustment: current
          ? toAdjRecord({ ...current, origin: current.origin as 'UI' | 'SPREADSHEET' })
          : null,
        version: item.adjustments.length,
      };
    });

    return { data, total };
  }

  async findForecastItem(
    forecastItemId: string,
  ): Promise<{ id: string; scenarioId: string } | null> {
    const item = await this.prisma.forecastItem.findUnique({
      where: { id: forecastItemId },
      select: { id: true, scenarioId: true },
    });
    return item;
  }

  async versionFor(forecastItemId: string): Promise<number> {
    return this.prisma.collaborationAdjustment.count({ where: { forecastItemId } });
  }

  async markDone(scenarioId: string, userId: string): Promise<void> {
    await this.prisma.scenarioMember.updateMany({
      where: { scenarioId, userId, role: 'COLLABORATOR', collaborationDoneAt: null },
      data: { collaborationDoneAt: new Date() },
    });
  }

  async allCollaboratorsDone(scenarioId: string): Promise<boolean> {
    const pending = await this.prisma.scenarioMember.count({
      where: { scenarioId, role: 'COLLABORATOR', collaborationDoneAt: null },
    });
    const total = await this.prisma.scenarioMember.count({
      where: { scenarioId, role: 'COLLABORATOR' },
    });
    return total > 0 && pending === 0;
  }

  async pendingCollaborators(
    scenarioId: string,
  ): Promise<{ userId: string | null; invitedEmail: string }[]> {
    const members = await this.prisma.scenarioMember.findMany({
      where: { scenarioId, role: 'COLLABORATOR', collaborationDoneAt: null },
      select: { userId: true, invitedEmail: true },
    });
    return members;
  }
}
