import { canPerform } from '@sop/domain';
import { AppError } from '../middleware/error-handler.js';
import type {
  MembershipRepository,
  ScenarioRepository,
} from '../composition/ports.js';

export class TeamService {
  constructor(
    private readonly scenarios: ScenarioRepository,
    private readonly membership: MembershipRepository,
  ) {}

  async closeTeam(scenarioId: string, requestingUserId: string): Promise<void> {
    const scenario = await this.scenarios.findById(scenarioId);
    if (!scenario) throw new AppError(404, 'SCENARIO_NOT_FOUND', 'cenário não encontrado');

    const isMember = await this.scenarios.isMember(scenarioId, requestingUserId);
    if (!isMember) throw new AppError(404, 'SCENARIO_NOT_FOUND', 'cenário não encontrado');

    const roles = await this.membership.getRolesForUser(scenarioId, requestingUserId);

    const authResult = canPerform('CLOSE_TEAM', {
      roles,
      phase: scenario.phase,
      finalSayRole: scenario.finalSayRole,
    });

    if (!authResult.allowed) {
      const status = authResult.code === 'PHASE_NOT_ALLOWED' ? 409 : 403;
      throw new AppError(status, authResult.code, authResult.reason);
    }

    const hasApprover = await this.membership.hasApprover(scenarioId);
    if (!hasApprover) {
      throw new AppError(
        409,
        'APPROVER_REQUIRED',
        'o cenário precisa de ao menos um aprovador para fechar a equipe',
      );
    }

    await this.scenarios.setTeamClosed(scenarioId);
    await this.scenarios.transitionPhase(scenarioId, 'TEAM_SETUP', 'IMPORT_SETUP');
  }
}
