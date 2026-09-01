import { describe, expect, it } from 'vitest';
import {
  PHASE_ORDER,
  canTransition,
  isActionAllowed,
  type TransitionContext,
} from '../../src/scenario/phase-machine.js';

/** Contexto em que tudo está satisfeito; cada teste nega o que quer exercitar. */
const ok: TransitionContext = {
  actor: 'CREATOR',
  teamClosed: true,
  hasApprover: true,
  ingestionCompleted: true,
  parametersComplete: true,
  forecastCompleted: true,
  allCollaboratorsDone: true,
  allItemsDecided: true,
};

describe('ordem das fases', () => {
  it('tem as oito fases do ciclo, na ordem da especificação', () => {
    expect(PHASE_ORDER).toEqual([
      'TEAM_SETUP',
      'IMPORT_SETUP',
      'CALCULATION',
      'APPROVAL',
      'COLLABORATION',
      'CONSENSUS',
      'PUBLICATION',
      'ACCURACY',
    ]);
  });
});

describe('transições permitidas', () => {
  it('TEAM_SETUP → IMPORT_SETUP com equipe fechada e aprovador', () => {
    expect(canTransition('TEAM_SETUP', 'IMPORT_SETUP', ok).allowed).toBe(true);
  });

  it('IMPORT_SETUP → CALCULATION com ingestão e parametrização completas', () => {
    expect(canTransition('IMPORT_SETUP', 'CALCULATION', ok).allowed).toBe(true);
  });

  it('CALCULATION → APPROVAL pelo sistema, quando o job conclui', () => {
    expect(canTransition('CALCULATION', 'APPROVAL', { ...ok, actor: 'SYSTEM' }).allowed).toBe(true);
  });

  it('APPROVAL → COLLABORATION pelo aprovador', () => {
    expect(canTransition('APPROVAL', 'COLLABORATION', { ...ok, actor: 'APPROVER' }).allowed).toBe(
      true,
    );
  });

  it('APPROVAL → IMPORT_SETUP na devolução com motivo (FR-056)', () => {
    const ctx = { ...ok, actor: 'APPROVER' as const, returnReason: 'sazonalidade ignorada' };
    expect(canTransition('APPROVAL', 'IMPORT_SETUP', ctx).allowed).toBe(true);
  });

  it('CONSENSUS → PUBLICATION com todos os itens decididos', () => {
    expect(canTransition('CONSENSUS', 'PUBLICATION', ok).allowed).toBe(true);
  });
});

describe('transições recusadas — guardas', () => {
  it('recusa TEAM_SETUP → IMPORT_SETUP sem aprovador (FR-015)', () => {
    const r = canTransition('TEAM_SETUP', 'IMPORT_SETUP', { ...ok, hasApprover: false });
    expect(r.allowed).toBe(false);
    expect(r.allowed === false && r.code).toBe('APPROVER_REQUIRED');
  });

  it('recusa TEAM_SETUP → IMPORT_SETUP com a equipe aberta', () => {
    const r = canTransition('TEAM_SETUP', 'IMPORT_SETUP', { ...ok, teamClosed: false });
    expect(r.allowed).toBe(false);
  });

  it('recusa IMPORT_SETUP → CALCULATION sem parametrização completa', () => {
    const r = canTransition('IMPORT_SETUP', 'CALCULATION', { ...ok, parametersComplete: false });
    expect(r.allowed).toBe(false);
  });

  it('recusa a devolução do aprovador sem motivo (FR-056)', () => {
    const r = canTransition('APPROVAL', 'IMPORT_SETUP', { ...ok, actor: 'APPROVER' });
    expect(r.allowed).toBe(false);
    expect(r.allowed === false && r.code).toBe('REASON_REQUIRED');
  });

  it('recusa CONSENSUS → PUBLICATION com item pendente (FR-073)', () => {
    const r = canTransition('CONSENSUS', 'PUBLICATION', { ...ok, allItemsDecided: false });
    expect(r.allowed).toBe(false);
    expect(r.allowed === false && r.code).toBe('DECISION_PENDING');
  });
});

describe('transições recusadas — papel', () => {
  it('colaborador não fecha a equipe', () => {
    const r = canTransition('TEAM_SETUP', 'IMPORT_SETUP', { ...ok, actor: 'COLLABORATOR' });
    expect(r.allowed).toBe(false);
    expect(r.allowed === false && r.code).toBe('FORBIDDEN');
  });

  it('criador não aprova no lugar do aprovador', () => {
    const r = canTransition('APPROVAL', 'COLLABORATION', { ...ok, actor: 'CREATOR' });
    expect(r.allowed).toBe(false);
    expect(r.allowed === false && r.code).toBe('FORBIDDEN');
  });
});

describe('transições inexistentes', () => {
  it('recusa salto de fase', () => {
    const r = canTransition('TEAM_SETUP', 'PUBLICATION', ok);
    expect(r.allowed).toBe(false);
    expect(r.allowed === false && r.code).toBe('PHASE_NOT_ALLOWED');
  });

  it('recusa retrocesso não previsto', () => {
    expect(canTransition('PUBLICATION', 'COLLABORATION', ok).allowed).toBe(false);
  });

  it('recusa permanecer na mesma fase', () => {
    expect(canTransition('APPROVAL', 'APPROVAL', ok).allowed).toBe(false);
  });

  it('ACCURACY é terminal', () => {
    for (const to of PHASE_ORDER) {
      expect(canTransition('ACCURACY', to, ok).allowed).toBe(false);
    }
  });
});

describe('ações permitidas por fase (FR-016)', () => {
  it('ajuste de colaboração só na fase de colaboração', () => {
    expect(isActionAllowed('COLLABORATION', 'ADJUST_FORECAST')).toBe(true);
    expect(isActionAllowed('APPROVAL', 'ADJUST_FORECAST')).toBe(false);
    expect(isActionAllowed('CONSENSUS', 'ADJUST_FORECAST')).toBe(false);
  });

  it('importar histórico só na parametrização', () => {
    expect(isActionAllowed('IMPORT_SETUP', 'IMPORT_HISTORY')).toBe(true);
    expect(isActionAllowed('TEAM_SETUP', 'IMPORT_HISTORY')).toBe(false);
  });

  it('convidar membro só na montagem da equipe (FR-014)', () => {
    expect(isActionAllowed('TEAM_SETUP', 'INVITE_MEMBER')).toBe(true);
    expect(isActionAllowed('IMPORT_SETUP', 'INVITE_MEMBER')).toBe(false);
  });

  it('subir vendas reais só na apuração', () => {
    expect(isActionAllowed('ACCURACY', 'UPLOAD_ACTUALS')).toBe(true);
    expect(isActionAllowed('PUBLICATION', 'UPLOAD_ACTUALS')).toBe(false);
  });
});
