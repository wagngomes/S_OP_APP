/**
 * Máquina de fases do cenário (FR-008, FR-016).
 *
 * Funções puras: nenhuma consulta, nenhum efeito. Quem chama coleta o estado e
 * pergunta; a resposta é determinística e testável sem infraestrutura.
 *
 * Toda transição que não esteja declarada aqui é recusada. Isso é deliberado:
 * um ciclo de S&OP em que se pode voltar do publicado para a colaboração perde
 * o significado do número oficial.
 */

export const PHASE_ORDER = [
  'TEAM_SETUP',
  'IMPORT_SETUP',
  'CALCULATION',
  'APPROVAL',
  'COLLABORATION',
  'CONSENSUS',
  'PUBLICATION',
  'ACCURACY',
] as const;

export type ScenarioPhase = (typeof PHASE_ORDER)[number];

export type Actor = 'CREATOR' | 'APPROVER' | 'COLLABORATOR' | 'SYSTEM';

export type TransitionContext = {
  actor: Actor;
  teamClosed: boolean;
  hasApprover: boolean;
  ingestionCompleted: boolean;
  parametersComplete: boolean;
  forecastCompleted: boolean;
  allCollaboratorsDone: boolean;
  allItemsDecided: boolean;
  /** Obrigatório na devolução da aprovação (FR-056). */
  returnReason?: string;
};

export type TransitionRefusalCode =
  | 'PHASE_NOT_ALLOWED'
  | 'FORBIDDEN'
  | 'APPROVER_REQUIRED'
  | 'REASON_REQUIRED'
  | 'DECISION_PENDING'
  | 'VALIDATION_FAILED';

export type TransitionResult =
  | { allowed: true }
  | { allowed: false; code: TransitionRefusalCode; reason: string };

const allow = (): TransitionResult => ({ allowed: true });
const refuse = (code: TransitionRefusalCode, reason: string): TransitionResult => ({
  allowed: false,
  code,
  reason,
});

type Rule = {
  actors: readonly Actor[];
  guard: (ctx: TransitionContext) => TransitionResult;
};

const noGuard = (): TransitionResult => allow();

/** Transições declaradas. A ausência de uma chave já é a recusa. */
const RULES: Partial<Record<ScenarioPhase, Partial<Record<ScenarioPhase, Rule>>>> = {
  TEAM_SETUP: {
    IMPORT_SETUP: {
      actors: ['CREATOR'],
      guard: (ctx) => {
        if (!ctx.hasApprover) {
          return refuse('APPROVER_REQUIRED', 'o cenário precisa de ao menos um aprovador');
        }
        if (!ctx.teamClosed) {
          return refuse('VALIDATION_FAILED', 'feche a equipe antes de importar o histórico');
        }
        return allow();
      },
    },
  },

  IMPORT_SETUP: {
    CALCULATION: {
      actors: ['CREATOR'],
      guard: (ctx) => {
        if (!ctx.ingestionCompleted) {
          return refuse('VALIDATION_FAILED', 'a importação do histórico ainda não concluiu');
        }
        if (!ctx.parametersComplete) {
          return refuse('VALIDATION_FAILED', 'a parametrização está incompleta');
        }
        return allow();
      },
    },
  },

  CALCULATION: {
    APPROVAL: {
      actors: ['SYSTEM'],
      guard: (ctx) =>
        ctx.forecastCompleted
          ? allow()
          : refuse('VALIDATION_FAILED', 'o cálculo ainda não concluiu'),
    },
  },

  APPROVAL: {
    COLLABORATION: { actors: ['APPROVER'], guard: noGuard },
    // FR-056 — devolução para nova parametrização, sempre com motivo.
    IMPORT_SETUP: {
      actors: ['APPROVER'],
      guard: (ctx) =>
        ctx.returnReason && ctx.returnReason.trim().length > 0
          ? allow()
          : refuse('REASON_REQUIRED', 'a devolução da previsão exige um motivo'),
    },
  },

  COLLABORATION: {
    // FR-064 pelo sistema quando todos concluem; FR-065 pelo criador, mesmo com pendentes.
    CONSENSUS: {
      actors: ['SYSTEM', 'CREATOR'],
      guard: (ctx) =>
        ctx.actor === 'CREATOR' || ctx.allCollaboratorsDone
          ? allow()
          : refuse('VALIDATION_FAILED', 'ainda há colaboradores sem concluir'),
    },
  },

  CONSENSUS: {
    PUBLICATION: {
      actors: ['CREATOR', 'APPROVER'],
      guard: (ctx) =>
        ctx.allItemsDecided
          ? allow()
          : refuse('DECISION_PENDING', 'há itens sem decisão de consenso'),
    },
  },

  PUBLICATION: {
    ACCURACY: { actors: ['SYSTEM'], guard: noGuard },
  },

  // ACCURACY é terminal: o ciclo acabou. Novo ciclo é novo cenário.
};

export function canTransition(
  from: ScenarioPhase,
  to: ScenarioPhase,
  ctx: TransitionContext,
): TransitionResult {
  const rule = RULES[from]?.[to];
  if (!rule) {
    return refuse('PHASE_NOT_ALLOWED', `não existe transição de ${from} para ${to}`);
  }
  if (!rule.actors.includes(ctx.actor)) {
    return refuse('FORBIDDEN', `o papel ${ctx.actor} não pode levar o cenário de ${from} a ${to}`);
  }
  return rule.guard(ctx);
}

/** Fases alcançáveis a partir de uma fase, ignorando guardas. */
export function nextPhases(from: ScenarioPhase): ScenarioPhase[] {
  return Object.keys(RULES[from] ?? {}) as ScenarioPhase[];
}

export type ScenarioAction =
  | 'INVITE_MEMBER'
  | 'CLOSE_TEAM'
  | 'IMPORT_HISTORY'
  | 'SET_PARAMETERS'
  | 'RUN_FORECAST'
  | 'APPROVE'
  | 'ADJUST_FORECAST'
  | 'DECIDE_CONSENSUS'
  | 'PUBLISH'
  | 'UPLOAD_ACTUALS';

/**
 * Em que fase cada ação é possível (FR-016).
 *
 * Fora dessas fases a ação é recusada com a razão do bloqueio — o usuário
 * precisa saber por que o botão não funciona, não apenas que não funciona.
 */
const ACTION_PHASES: Record<ScenarioAction, readonly ScenarioPhase[]> = {
  INVITE_MEMBER: ['TEAM_SETUP'],
  CLOSE_TEAM: ['TEAM_SETUP'],
  IMPORT_HISTORY: ['IMPORT_SETUP'],
  SET_PARAMETERS: ['IMPORT_SETUP'],
  RUN_FORECAST: ['IMPORT_SETUP', 'CALCULATION'],
  APPROVE: ['APPROVAL'],
  ADJUST_FORECAST: ['COLLABORATION'],
  DECIDE_CONSENSUS: ['CONSENSUS'],
  PUBLISH: ['CONSENSUS'],
  UPLOAD_ACTUALS: ['ACCURACY'],
};

export function isActionAllowed(phase: ScenarioPhase, action: ScenarioAction): boolean {
  return ACTION_PHASES[action].includes(phase);
}
