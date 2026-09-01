import { isActionAllowed, type ScenarioAction, type ScenarioPhase } from './phase-machine.js';

/**
 * Autorização de processo (D8, FR-010, FR-011, FR-071).
 *
 * Distinta da autenticação. O BetterAuth responde "quem é você"; isto responde
 * "o que este PAPEL pode fazer NESTA FASE" — que é regra de negócio de S&OP, e
 * por isso vive no domínio como função pura, e não em middleware de transporte.
 *
 * Se estivesse no middleware, testá-la exigiria subir servidor, e a matriz
 * papel × fase × ação — que é onde os erros de permissão realmente moram —
 * ficaria sem cobertura.
 */

export type MemberRole = 'CREATOR' | 'APPROVER' | 'COLLABORATOR';
export type FinalSayRole = 'CREATOR' | 'APPROVER';

export type AuthorizationContext = {
  roles: readonly MemberRole[];
  phase: ScenarioPhase;
  /** Quem decide o consenso, definido na criação do cenário (FR-011, FR-012). */
  finalSayRole: FinalSayRole;
};

export type AuthorizationResult =
  | { allowed: true }
  | { allowed: false; code: 'FORBIDDEN' | 'PHASE_NOT_ALLOWED'; reason: string };

/** Papéis que podem executar cada ação, independentemente da fase. */
const ACTION_ROLES: Record<ScenarioAction, readonly MemberRole[] | 'FINAL_SAY'> = {
  INVITE_MEMBER: ['CREATOR'],
  CLOSE_TEAM: ['CREATOR'],
  IMPORT_HISTORY: ['CREATOR'],
  SET_PARAMETERS: ['CREATOR'],
  RUN_FORECAST: ['CREATOR'],
  APPROVE: ['APPROVER'],
  // Sem recorte por colaborador: todos atuam sobre o cenário inteiro (FR-066).
  ADJUST_FORECAST: ['COLLABORATOR'],
  DECIDE_CONSENSUS: 'FINAL_SAY',
  PUBLISH: 'FINAL_SAY',
  UPLOAD_ACTUALS: ['CREATOR'],
};

/** Se o conjunto de papéis detém a palavra final (FR-071). */
export function hasFinalSay(
  roles: readonly MemberRole[],
  finalSayRole: FinalSayRole,
): boolean {
  return roles.includes(finalSayRole);
}

export function canPerform(
  action: ScenarioAction,
  ctx: AuthorizationContext,
): AuthorizationResult {
  // A fase é verificada primeiro: uma ação impossível na fase atual é bloqueio de
  // processo, não de permissão, e a mensagem precisa dizer isso ao usuário.
  if (!isActionAllowed(ctx.phase, action)) {
    return {
      allowed: false,
      code: 'PHASE_NOT_ALLOWED',
      reason: `a ação ${action} não é possível na fase ${ctx.phase}`,
    };
  }

  const required = ACTION_ROLES[action];

  if (required === 'FINAL_SAY') {
    return hasFinalSay(ctx.roles, ctx.finalSayRole)
      ? { allowed: true }
      : {
          allowed: false,
          code: 'FORBIDDEN',
          reason: `a palavra final neste cenário é do papel ${ctx.finalSayRole}`,
        };
  }

  const permitted = ctx.roles.some((role) => required.includes(role));
  return permitted
    ? { allowed: true }
    : {
        allowed: false,
        code: 'FORBIDDEN',
        reason: `a ação ${action} exige um dos papéis: ${required.join(', ')}`,
      };
}
