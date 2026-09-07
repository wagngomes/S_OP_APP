import { computeDivergence, isWithinTolerance, sortByDivergence } from '@sop/domain';
import { validateDecision } from '@sop/domain';
import { AppError } from '../middleware/error-handler.js';
import type {
  ConsensusDecisionRecord,
  ConsensusItemRecord,
  ConsensusRepository,
  MembershipRepository,
  ScenarioRecord,
  ScenarioRepository,
  ToleranceUpdate,
} from '../composition/ports.js';

function canDecide(scenario: ScenarioRecord, roles: string[]): boolean {
  if (scenario.finalSayRole === 'CREATOR') return roles.includes('CREATOR');
  if (scenario.finalSayRole === 'APPROVER') return roles.includes('APPROVER');
  return false;
}

export class ConsensusService {
  constructor(
    private readonly scenarios: ScenarioRepository,
    private readonly membership: MembershipRepository,
    private readonly consensus: ConsensusRepository,
  ) {}

  async setTolerance(
    scenarioId: string,
    userId: string,
    tolerance: ToleranceUpdate | null,
  ): Promise<void> {
    const scenario = await this.scenarios.findById(scenarioId);
    if (!scenario) throw new AppError(404, 'NOT_FOUND', 'cenário não encontrado');
    if (scenario.phase !== 'CONSENSUS') {
      throw new AppError(409, 'PHASE_NOT_ALLOWED', 'cenário não está na fase de consenso');
    }
    const roles = await this.membership.getRolesForUser(scenarioId, userId);
    if (!canDecide(scenario, roles)) {
      throw new AppError(403, 'FORBIDDEN', 'apenas o responsável final pode definir a tolerância');
    }
    await this.scenarios.setTolerance(scenarioId, tolerance);
  }

  async listItems(
    scenarioId: string,
    userId: string,
    page: { limit: number; offset: number },
    sortByDelta = false,
  ): Promise<{ data: (ConsensusItemRecord & { divergence: ReturnType<typeof computeDivergence>; withinTolerance: boolean })[]; total: number }> {
    const scenario = await this.scenarios.findById(scenarioId);
    if (!scenario) throw new AppError(404, 'NOT_FOUND', 'cenário não encontrado');
    if (!(await this.scenarios.isMember(scenarioId, userId))) {
      throw new AppError(404, 'NOT_FOUND', 'cenário não encontrado');
    }

    const tolerance = scenario.consensusToleranceValue !== null && scenario.consensusToleranceValue !== undefined
      ? {
          value: String(scenario.consensusToleranceValue),
          kind: scenario.consensusToleranceKind as 'ABSOLUTE' | 'PERCENT',
        }
      : null;

    if (sortByDelta) {
      // Load all to sort, then page
      const all = await this.consensus.listItemsForConsensus(scenarioId, { limit: 10000, offset: 0 });
      const enriched = all.data.map((item) => ({
        ...item,
        divergence: computeDivergence(item.calculatedQuantity, item.collaboratedQuantity),
        withinTolerance: false as boolean,
      }));
      enriched.forEach((item) => {
        item.withinTolerance = isWithinTolerance(item.divergence, tolerance);
      });
      const sorted = sortByDivergence(
        enriched.map((item) => ({
          ...item,
          calculated: item.calculatedQuantity,
          collaborated: item.collaboratedQuantity,
        })),
      );
      const pageData = sorted.slice(page.offset, page.offset + page.limit);
      return { data: pageData, total: all.total };
    }

    const result = await this.consensus.listItemsForConsensus(scenarioId, page);
    const data = result.data.map((item) => {
      const divergence = computeDivergence(item.calculatedQuantity, item.collaboratedQuantity);
      return {
        ...item,
        divergence,
        withinTolerance: isWithinTolerance(divergence, tolerance),
      };
    });

    return { data, total: result.total };
  }

  async decide(
    scenarioId: string,
    userId: string,
    input: {
      forecastItemId: string;
      source: 'CALCULATED' | 'COLLABORATED' | 'MANUAL';
      quantity: string;
      reason?: string;
    },
  ): Promise<ConsensusDecisionRecord> {
    const scenario = await this.scenarios.findById(scenarioId);
    if (!scenario) throw new AppError(404, 'NOT_FOUND', 'cenário não encontrado');
    if (scenario.phase !== 'CONSENSUS') {
      throw new AppError(409, 'PHASE_NOT_ALLOWED', 'cenário não está na fase de consenso');
    }
    const roles = await this.membership.getRolesForUser(scenarioId, userId);
    if (!canDecide(scenario, roles)) {
      throw new AppError(403, 'FORBIDDEN', 'apenas o responsável final pode registrar decisões');
    }

    // Load the item to get calculated/collaborated quantities
    const result = await this.consensus.listItemsForConsensus(scenarioId, { limit: 1, offset: 0 });
    // We need the specific item — use a broader search or add a findItem method
    // For now, get all items and find the matching one (acceptable for MVP)
    const allItems = await this.consensus.listItemsForConsensus(scenarioId, { limit: 10000, offset: 0 });
    const item = allItems.data.find((i) => i.id === input.forecastItemId);
    if (!item) {
      throw new AppError(404, 'NOT_FOUND', 'item de previsão não encontrado neste cenário');
    }

    const issues = validateDecision({
      source: input.source,
      quantity: input.quantity,
      ...(input.reason !== undefined ? { reason: input.reason } : {}),
      calculated: item.calculatedQuantity,
      collaborated: item.collaboratedQuantity,
    });
    if (issues.length > 0) {
      throw new AppError(422, 'VALIDATION_FAILED', issues.map((i) => i.detail).join('; '));
    }

    return this.consensus.createDecision({
      forecastItemId: input.forecastItemId,
      decidedById: userId,
      source: input.source,
      quantity: input.quantity,
      ...(input.reason !== undefined ? { reason: input.reason } : {}),
      calculatedQuantity: item.calculatedQuantity,
      collaboratedQuantity: item.collaboratedQuantity,
    });
  }
}
