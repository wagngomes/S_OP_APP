import { canPerform, validateAdjustment, checkItemVersion } from '@sop/domain';
import { AppError } from '../middleware/error-handler.js';
import type {
  CollaborationAdjustmentRecord,
  CollaborationItemRecord,
  CollaborationRepository,
  MembershipRepository,
  ScenarioRepository,
} from '../composition/ports.js';

export class CollaborationService {
  constructor(
    private readonly scenarios: ScenarioRepository,
    private readonly membership: MembershipRepository,
    private readonly collab: CollaborationRepository,
  ) {}

  async adjust(
    scenarioId: string,
    userId: string,
    input: { forecastItemId: string; quantity: string; reason: string; expectedVersion?: number },
  ): Promise<CollaborationAdjustmentRecord> {
    const scenario = await this.scenarios.findById(scenarioId);
    if (!scenario) throw new AppError(404, 'NOT_FOUND', 'cenário não encontrado');

    const roles = await this.membership.getRolesForUser(scenarioId, userId);
    const auth = canPerform('ADJUST_FORECAST', {
      roles,
      phase: scenario.phase,
      finalSayRole: scenario.finalSayRole,
    });
    if (!auth.allowed) {
      const status = auth.code === 'PHASE_NOT_ALLOWED' ? 409 : 403;
      throw new AppError(status, auth.code, auth.reason);
    }

    const issues = validateAdjustment({ quantity: input.quantity, reason: input.reason });
    if (issues.length > 0) {
      throw new AppError(422, 'VALIDATION_FAILED', issues.map((i) => i.detail).join('; '));
    }

    const item = await this.collab.findForecastItem(input.forecastItemId);
    if (!item || item.scenarioId !== scenarioId) {
      throw new AppError(404, 'NOT_FOUND', 'item de previsão não encontrado neste cenário');
    }

    const version = await this.collab.versionFor(input.forecastItemId);
    const versionCheck = checkItemVersion(version, input.expectedVersion);
    if (!versionCheck.allowed) {
      throw new AppError(409, versionCheck.code, versionCheck.reason);
    }

    return this.collab.createAdjustment({
      scenarioId,
      forecastItemId: input.forecastItemId,
      authorId: userId,
      quantity: input.quantity,
      reason: input.reason,
      origin: 'UI',
    });
  }

  async listItems(
    scenarioId: string,
    userId: string,
    page: { limit: number; offset: number },
  ): Promise<{ data: CollaborationItemRecord[]; total: number }> {
    const scenario = await this.scenarios.findById(scenarioId);
    if (!scenario) throw new AppError(404, 'NOT_FOUND', 'cenário não encontrado');
    if (!(await this.scenarios.isMember(scenarioId, userId))) {
      throw new AppError(404, 'NOT_FOUND', 'cenário não encontrado');
    }
    return this.collab.listItemsWithAdjustments(scenarioId, page);
  }

  /** FR-063 — colaborador sinaliza que concluiu; FR-064 encerra automaticamente quando todos terminam. */
  async markDone(scenarioId: string, userId: string): Promise<void> {
    const scenario = await this.scenarios.findById(scenarioId);
    if (!scenario) throw new AppError(404, 'NOT_FOUND', 'cenário não encontrado');
    if (scenario.phase !== 'COLLABORATION') {
      throw new AppError(409, 'PHASE_NOT_ALLOWED', 'cenário não está na fase de colaboração');
    }

    const roles = await this.membership.getRolesForUser(scenarioId, userId);
    if (!roles.includes('COLLABORATOR')) {
      throw new AppError(403, 'FORBIDDEN', 'apenas colaboradores podem sinalizar conclusão');
    }

    await this.collab.markDone(scenarioId, userId);

    if (await this.collab.allCollaboratorsDone(scenarioId)) {
      await this.scenarios.transitionPhase(scenarioId, 'COLLABORATION', 'CONSENSUS');
    }
  }

  /** FR-065 — criador encerra mesmo com colaboradores pendentes. */
  async closeCollaboration(scenarioId: string, userId: string): Promise<void> {
    const scenario = await this.scenarios.findById(scenarioId);
    if (!scenario) throw new AppError(404, 'NOT_FOUND', 'cenário não encontrado');
    if (scenario.phase !== 'COLLABORATION') {
      throw new AppError(409, 'PHASE_NOT_ALLOWED', 'cenário não está na fase de colaboração');
    }

    const roles = await this.membership.getRolesForUser(scenarioId, userId);
    if (!roles.includes('CREATOR')) {
      throw new AppError(403, 'FORBIDDEN', 'apenas o criador pode encerrar a colaboração antecipadamente');
    }

    await this.scenarios.transitionPhase(scenarioId, 'COLLABORATION', 'CONSENSUS');
  }
}
