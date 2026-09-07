import { AppError } from '../middleware/error-handler.js';
import type {
  ConsensusRepository,
  MembershipRepository,
  ScenarioRepository,
} from '../composition/ports.js';

export class PublicationService {
  constructor(
    private readonly scenarios: ScenarioRepository,
    private readonly membership: MembershipRepository,
    private readonly consensus: ConsensusRepository,
  ) {}

  /** FR-073 — recusa publicação se qualquer item não tem decisão. FR-074, FR-075 — publica. */
  async publish(scenarioId: string, userId: string): Promise<void> {
    const scenario = await this.scenarios.findById(scenarioId);
    if (!scenario) throw new AppError(404, 'NOT_FOUND', 'cenário não encontrado');
    if (scenario.phase !== 'CONSENSUS') {
      throw new AppError(409, 'PHASE_NOT_ALLOWED', 'cenário não está na fase de consenso');
    }

    const roles = await this.membership.getRolesForUser(scenarioId, userId);
    const canPublish =
      (scenario.finalSayRole === 'CREATOR' && roles.includes('CREATOR')) ||
      (scenario.finalSayRole === 'APPROVER' && roles.includes('APPROVER'));
    if (!canPublish) {
      throw new AppError(403, 'FORBIDDEN', 'apenas o responsável final pode publicar');
    }

    const allDecided = await this.consensus.allItemsDecided(scenarioId);
    if (!allDecided) {
      throw new AppError(409, 'UNDECIDED_ITEMS', 'há itens sem decisão — decida todos antes de publicar');
    }

    await this.consensus.publishForecast(scenarioId);
    await this.scenarios.setPublishedAt(scenarioId);
    await this.scenarios.transitionPhase(scenarioId, 'CONSENSUS', 'PUBLICATION');
  }
}
