import { canPerform } from '@sop/domain';
import { AppError } from '../middleware/error-handler.js';
import type {
  MemberRole,
  MembershipRepository,
  ScenarioMemberRecord,
  ScenarioRepository,
} from '../composition/ports.js';

export class MembershipService {
  constructor(
    private readonly scenarios: ScenarioRepository,
    private readonly membership: MembershipRepository,
  ) {}

  async invite(
    scenarioId: string,
    requestingUserId: string,
    input: { email: string; role: Extract<MemberRole, 'APPROVER' | 'COLLABORATOR'> },
  ): Promise<ScenarioMemberRecord> {
    const scenario = await this.scenarios.findById(scenarioId);
    if (!scenario) throw new AppError(404, 'SCENARIO_NOT_FOUND', 'cenário não encontrado');

    const isMember = await this.scenarios.isMember(scenarioId, requestingUserId);
    if (!isMember) throw new AppError(404, 'SCENARIO_NOT_FOUND', 'cenário não encontrado');

    const roles = await this.membership.getRolesForUser(scenarioId, requestingUserId);

    const authResult = canPerform('INVITE_MEMBER', {
      roles,
      phase: scenario.phase,
      finalSayRole: scenario.finalSayRole,
    });

    if (!authResult.allowed) {
      const status = authResult.code === 'PHASE_NOT_ALLOWED' ? 409 : 403;
      throw new AppError(status, authResult.code, authResult.reason);
    }

    return this.membership.invite({
      scenarioId,
      invitedEmail: input.email,
      role: input.role,
    });
  }

  async listMembers(
    scenarioId: string,
    requestingUserId: string,
  ): Promise<ScenarioMemberRecord[]> {
    const scenario = await this.scenarios.findById(scenarioId);
    if (!scenario) throw new AppError(404, 'SCENARIO_NOT_FOUND', 'cenário não encontrado');

    const isMember = await this.scenarios.isMember(scenarioId, requestingUserId);
    if (!isMember) throw new AppError(404, 'SCENARIO_NOT_FOUND', 'cenário não encontrado');

    return this.membership.listMembers(scenarioId);
  }
}
