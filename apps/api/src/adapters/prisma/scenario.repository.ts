import type { PrismaClient } from '@prisma/client';
import type {
  HistoryStats,
  ParametersRecord,
  ScenarioRecord,
  ScenarioRepository,
  SegmentationLevelRecord,
  ToleranceUpdate,
} from '../../composition/ports.js';

function toRecord(s: {
  id: string;
  name: string;
  phase: string;
  createdById: string;
  finalSayRole: string;
  teamClosedAt: Date | null;
  forecastHorizonMonths: number;
  consensusToleranceValue: { toFixed: (n: number) => string } | null;
  consensusToleranceKind: string | null;
  publishedAt: Date | null;
  createdAt: Date;
}): ScenarioRecord {
  return {
    id: s.id,
    name: s.name,
    phase: s.phase as ScenarioRecord['phase'],
    createdById: s.createdById,
    finalSayRole: s.finalSayRole as ScenarioRecord['finalSayRole'],
    teamClosedAt: s.teamClosedAt?.toISOString() ?? null,
    forecastHorizonMonths: s.forecastHorizonMonths,
    consensusToleranceValue: s.consensusToleranceValue?.toFixed(6) ?? null,
    consensusToleranceKind: s.consensusToleranceKind as ScenarioRecord['consensusToleranceKind'],
    publishedAt: s.publishedAt?.toISOString() ?? null,
    createdAt: s.createdAt.toISOString(),
  };
}

export class PrismaScenarioRepository implements ScenarioRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: {
    name: string;
    createdById: string;
    finalSayRole: 'CREATOR' | 'APPROVER';
    forecastHorizonMonths: number;
  }): Promise<ScenarioRecord> {
    const creator = await this.prisma.user.findUnique({
      where: { id: input.createdById },
      select: { email: true },
    });
    const s = await this.prisma.scenario.create({
      data: {
        name: input.name,
        createdById: input.createdById,
        finalSayRole: input.finalSayRole,
        forecastHorizonMonths: input.forecastHorizonMonths,
        members: {
          create: {
            invitedEmail: creator?.email ?? '',
            role: 'CREATOR',
            userId: input.createdById,
          },
        },
      },
    });
    return toRecord(s);
  }

  async findById(id: string): Promise<ScenarioRecord | null> {
    const s = await this.prisma.scenario.findUnique({ where: { id } });
    return s ? toRecord(s) : null;
  }

  async isMember(scenarioId: string, userId: string): Promise<boolean> {
    const count = await this.prisma.scenario.count({
      where: {
        id: scenarioId,
        OR: [
          { createdById: userId },
          { members: { some: { userId } } },
        ],
      },
    });
    return count > 0;
  }

  async listForUser(
    userId: string,
    page: { limit: number; offset: number },
  ): Promise<{ data: ScenarioRecord[]; total: number }> {
    const where = {
      OR: [
        { createdById: userId },
        { members: { some: { userId } } },
      ],
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.scenario.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: page.offset,
        take: page.limit,
      }),
      this.prisma.scenario.count({ where }),
    ]);

    return { data: rows.map(toRecord), total };
  }

  async listLevels(scenarioId: string): Promise<SegmentationLevelRecord[]> {
    const levels = await this.prisma.segmentationLevel.findMany({
      where: { scenarioId },
      orderBy: { position: 'asc' },
    });
    return levels.map((l) => ({ id: l.id, position: l.position, label: l.label }));
  }

  async getParameters(scenarioId: string): Promise<ParametersRecord | null> {
    const p = await this.prisma.forecastParameters.findUnique({ where: { scenarioId } });
    if (!p) return null;
    return {
      groupingLevelIds: p.groupingLevelIds,
      prorationMonths: p.prorationMonths,
      accuracyMetric: p.accuracyMetric as ParametersRecord['accuracyMetric'],
      modelPackage: p.modelPackage as ParametersRecord['modelPackage'],
      horizonMonths: p.horizonMonths,
    };
  }

  async saveParameters(scenarioId: string, params: ParametersRecord): Promise<void> {
    await this.prisma.forecastParameters.upsert({
      where: { scenarioId },
      create: {
        scenarioId,
        groupingLevelIds: params.groupingLevelIds,
        prorationMonths: params.prorationMonths,
        accuracyMetric: params.accuracyMetric,
        modelPackage: params.modelPackage,
        horizonMonths: params.horizonMonths,
      },
      update: {
        groupingLevelIds: params.groupingLevelIds,
        prorationMonths: params.prorationMonths,
        accuracyMetric: params.accuracyMetric,
        modelPackage: params.modelPackage,
        horizonMonths: params.horizonMonths,
      },
    });
  }

  async historyStats(scenarioId: string): Promise<HistoryStats> {
    const months = await this.prisma.salesRecord.groupBy({
      by: ['year', 'month'],
      where: { scenarioId },
    });
    const availableHistoryMonths = months.length;

    // Proporção de meses onde a soma é zero — aproximação: conta registros zerados vs total
    if (availableHistoryMonths === 0) {
      return { availableHistoryMonths: 0, zeroMonthProportion: 0 };
    }

    // Conta meses distintos com pelo menos um registro não-zero
    const nonZero = await this.prisma.salesRecord.groupBy({
      by: ['year', 'month'],
      where: { scenarioId, quantity: { gt: 0 } },
    });
    const zeroMonths = availableHistoryMonths - nonZero.length;
    return {
      availableHistoryMonths,
      zeroMonthProportion: zeroMonths / availableHistoryMonths,
    };
  }

  async countDistinctSeries(scenarioId: string, _levelIds: string[]): Promise<number> {
    // Conta combinações distintas de productCode + segments (proxy de séries)
    const groups = await this.prisma.salesRecord.groupBy({
      by: ['productCode', 'segments'],
      where: { scenarioId },
    });
    return groups.length;
  }

  async transitionPhase(
    scenarioId: string,
    from: ScenarioRecord['phase'],
    to: ScenarioRecord['phase'],
  ): Promise<void> {
    await this.prisma.scenario.updateMany({
      where: { id: scenarioId, phase: from },
      data: { phase: to },
    });
  }

  async setTeamClosed(scenarioId: string): Promise<void> {
    await this.prisma.scenario.update({
      where: { id: scenarioId },
      data: { teamClosedAt: new Date() },
    });
  }

  async setTolerance(scenarioId: string, tolerance: ToleranceUpdate | null): Promise<void> {
    await this.prisma.scenario.update({
      where: { id: scenarioId },
      data: {
        consensusToleranceValue: tolerance?.value ?? null,
        consensusToleranceKind: tolerance?.kind ?? null,
      },
    });
  }

  async setPublishedAt(scenarioId: string): Promise<void> {
    await this.prisma.scenario.update({
      where: { id: scenarioId },
      data: { publishedAt: new Date() },
    });
  }
}
