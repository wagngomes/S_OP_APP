import { describe, expect, it } from 'vitest';
import { canPerform, hasFinalSay, type AuthorizationContext } from '../../src/scenario/authorization.js';

/**
 * Autorização de processo (D8, FR-010, FR-011, FR-071).
 *
 * Distinta da autenticação: aqui não se pergunta quem é a pessoa, mas o que
 * aquele PAPEL pode fazer NAQUELA FASE. Como depende da fase, é regra de negócio
 * de S&OP e vive no domínio — não em middleware de transporte.
 */

const ctx = (over: Partial<AuthorizationContext> = {}): AuthorizationContext => ({
  roles: ['CREATOR'],
  phase: 'TEAM_SETUP',
  finalSayRole: 'CREATOR',
  ...over,
});

describe('papéis e ações', () => {
  it('o criador convida e fecha a equipe', () => {
    expect(canPerform('INVITE_MEMBER', ctx()).allowed).toBe(true);
    expect(canPerform('CLOSE_TEAM', ctx()).allowed).toBe(true);
  });

  it('colaborador não convida nem fecha equipe', () => {
    const c = ctx({ roles: ['COLLABORATOR'] });
    expect(canPerform('INVITE_MEMBER', c).allowed).toBe(false);
    expect(canPerform('CLOSE_TEAM', c).allowed).toBe(false);
  });

  it('só o aprovador aprova', () => {
    const phase = 'APPROVAL' as const;
    expect(canPerform('APPROVE', ctx({ roles: ['APPROVER'], phase })).allowed).toBe(true);
    expect(canPerform('APPROVE', ctx({ roles: ['CREATOR'], phase })).allowed).toBe(false);
  });

  it('colaborador ajusta a previsão na colaboração', () => {
    const c = ctx({ roles: ['COLLABORATOR'], phase: 'COLLABORATION' });
    expect(canPerform('ADJUST_FORECAST', c).allowed).toBe(true);
  });

  it('todo colaborador atua sobre o cenário inteiro (FR-066)', () => {
    // Não há recorte por colaborador: a autorização não olha estrutura comercial.
    const c = ctx({ roles: ['COLLABORATOR'], phase: 'COLLABORATION' });
    expect(canPerform('ADJUST_FORECAST', c).allowed).toBe(true);
  });

  it('um usuário pode acumular papéis', () => {
    const c = ctx({ roles: ['APPROVER', 'COLLABORATOR'], phase: 'APPROVAL' });
    expect(canPerform('APPROVE', c).allowed).toBe(true);
  });
});

describe('fase antes do papel (FR-016)', () => {
  it('recusa ação certa na fase errada', () => {
    const r = canPerform('ADJUST_FORECAST', ctx({ roles: ['COLLABORATOR'], phase: 'APPROVAL' }));
    expect(r.allowed).toBe(false);
    expect(r.allowed === false && r.code).toBe('PHASE_NOT_ALLOWED');
  });

  it('a razão do bloqueio é informada', () => {
    const r = canPerform('PUBLISH', ctx({ phase: 'TEAM_SETUP' }));
    expect(r.allowed === false && r.reason).toContain('TEAM_SETUP');
  });

  it('papel errado na fase certa devolve FORBIDDEN, não PHASE_NOT_ALLOWED', () => {
    const r = canPerform('APPROVE', ctx({ roles: ['COLLABORATOR'], phase: 'APPROVAL' }));
    expect(r.allowed === false && r.code).toBe('FORBIDDEN');
  });
});

describe('palavra final no consenso (FR-011, FR-012, FR-071)', () => {
  it('por padrão é do criador', () => {
    expect(hasFinalSay(['CREATOR'], 'CREATOR')).toBe(true);
    expect(hasFinalSay(['APPROVER'], 'CREATOR')).toBe(false);
  });

  it('pode ser do aprovador quando assim definido', () => {
    expect(hasFinalSay(['APPROVER'], 'APPROVER')).toBe(true);
    expect(hasFinalSay(['CREATOR'], 'APPROVER')).toBe(false);
  });

  it('quem acumula os dois papéis tem a palavra final em qualquer configuração', () => {
    expect(hasFinalSay(['CREATOR', 'APPROVER'], 'APPROVER')).toBe(true);
    expect(hasFinalSay(['CREATOR', 'APPROVER'], 'CREATOR')).toBe(true);
  });

  it('decidir consenso exige a palavra final, não apenas ser da equipe', () => {
    const base = { phase: 'CONSENSUS' as const, finalSayRole: 'APPROVER' as const };
    expect(canPerform('DECIDE_CONSENSUS', ctx({ roles: ['APPROVER'], ...base })).allowed).toBe(true);
    expect(canPerform('DECIDE_CONSENSUS', ctx({ roles: ['CREATOR'], ...base })).allowed).toBe(false);
  });

  it('publicar segue a mesma regra da decisão', () => {
    const base = { phase: 'CONSENSUS' as const, finalSayRole: 'CREATOR' as const };
    expect(canPerform('PUBLISH', ctx({ roles: ['CREATOR'], ...base })).allowed).toBe(true);
    expect(canPerform('PUBLISH', ctx({ roles: ['APPROVER'], ...base })).allowed).toBe(false);
  });
});

describe('sem papel', () => {
  it('quem não tem papel algum não faz nada', () => {
    const r = canPerform('INVITE_MEMBER', ctx({ roles: [] }));
    expect(r.allowed).toBe(false);
  });
});
