import { canPerform } from '@sop/domain';
import { AppError } from '../middleware/error-handler.js';
import type {
  MembershipRepository,
  ScenarioRepository,
} from '../composition/ports.js';

export class ApprovalService {
  constructor(
    private readonly scenarios: ScenarioRepository,
    private readonly membership: MembershipRepository,
  ) {}

  async decide(
    scenarioId: string,
    requestingUserId: string,
    input: { decision: 'APPROVE' | 'RETURN'; reason?: string },
  ): Promise<void> {
    const scenario = await this.scenarios.findById(scenarioId);
    if (!scenario) throw new AppError(404, 'SCENARIO_NOT_FOUND', 'cenário não encontrado');

    const isMember = await this.scenarios.isMember(scenarioId, requestingUserId);
    if (!isMember) throw new AppError(404, 'SCENARIO_NOT_FOUND', 'cenário não encontrado');

    const roles = await this.membership.getRolesForUser(scenarioId, requestingUserId);

    const authResult = canPerform('APPROVE', {
      roles,
      phase: scenario.phase,
      finalSayRole: scenario.finalSayRole,
    });

    if (!authResult.allowed) {
      const status = authResult.code === 'PHASE_NOT_ALLOWED' ? 409 : 403;
      throw new AppError(status, authResult.code, authResult.reason);
    }

    if (input.decision === 'RETURN') {
      if (!input.reason || input.reason.trim().length === 0) {
        throw new AppError(409, 'REASON_REQUIRED', 'a devolução da previsão exige um motivo');
      }
      await this.scenarios.transitionPhase(scenarioId, 'APPROVAL', 'IMPORT_SETUP');
    } else {
      await this.scenarios.transitionPhase(scenarioId, 'APPROVAL', 'COLLABORATION');
    }
  }
}
