import { describe, expect, it } from 'vitest';
import { ApprovalDecisionBody, InviteMemberBody, MembersResponse, ScenarioMember } from '@sop/contracts';

/**
 * T118 — Testes de contrato para membros e aprovação.
 *
 * Garantem que os schemas Zod rejeitam entradas inválidas e aceitam as válidas,
 * servindo de especificação executável para o frontend e para o motor.
 */

describe('InviteMemberBody', () => {
  it('aceita email e role válidos', () => {
    const result = InviteMemberBody.safeParse({ email: 'ana@empresa.com', role: 'APPROVER' });
    expect(result.success).toBe(true);
  });

  it('rejeita role CREATOR (criador não é convidado)', () => {
    const result = InviteMemberBody.safeParse({ email: 'ana@empresa.com', role: 'CREATOR' });
    expect(result.success).toBe(false);
  });

  it('rejeita e-mail inválido', () => {
    const result = InviteMemberBody.safeParse({ email: 'nao-e-email', role: 'COLLABORATOR' });
    expect(result.success).toBe(false);
  });

  it('rejeita quando email ausente', () => {
    const result = InviteMemberBody.safeParse({ role: 'APPROVER' });
    expect(result.success).toBe(false);
  });
});

describe('ApprovalDecisionBody', () => {
  it('aceita APPROVE sem motivo', () => {
    const result = ApprovalDecisionBody.safeParse({ decision: 'APPROVE' });
    expect(result.success).toBe(true);
  });

  it('aceita RETURN com motivo', () => {
    const result = ApprovalDecisionBody.safeParse({ decision: 'RETURN', reason: 'Horizon incorreto' });
    expect(result.success).toBe(true);
  });

  it('rejeita decision desconhecida', () => {
    const result = ApprovalDecisionBody.safeParse({ decision: 'ACCEPT' });
    expect(result.success).toBe(false);
  });

  it('rejeita reason vazio (string com length 0)', () => {
    const result = ApprovalDecisionBody.safeParse({ decision: 'RETURN', reason: '' });
    expect(result.success).toBe(false);
  });
});

describe('ScenarioMember', () => {
  it('aceita membro sem userId (convite antes do cadastro)', () => {
    const result = ScenarioMember.safeParse({
      id: '018f0000-0000-7000-8000-000000000001',
      scenarioId: '018f0000-0000-7000-8000-000000000002',
      invitedEmail: 'carlos@empresa.com',
      role: 'APPROVER',
      userId: null,
      collaborationDoneAt: null,
      createdAt: new Date().toISOString(),
    });
    expect(result.success).toBe(true);
  });

  it('aceita membro com userId após aceite do convite', () => {
    const result = ScenarioMember.safeParse({
      id: '018f0000-0000-7000-8000-000000000001',
      scenarioId: '018f0000-0000-7000-8000-000000000002',
      invitedEmail: 'carlos@empresa.com',
      role: 'COLLABORATOR',
      userId: '018f0000-0000-7000-8000-000000000003',
      collaborationDoneAt: null,
      createdAt: new Date().toISOString(),
    });
    expect(result.success).toBe(true);
  });
});

describe('MembersResponse', () => {
  it('aceita lista vazia', () => {
    const result = MembersResponse.safeParse({ data: [] });
    expect(result.success).toBe(true);
  });
});
