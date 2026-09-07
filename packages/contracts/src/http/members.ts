import { z } from 'zod';

/**
 * Contratos HTTP para membros de equipe e aprovação (US2).
 *
 * FR-009, FR-013-015, FR-055, FR-056.
 */

export const MemberRoleSchema = z.enum(['CREATOR', 'APPROVER', 'COLLABORATOR']);
export type MemberRoleSchema = z.infer<typeof MemberRoleSchema>;

export const InviteMemberBody = z.object({
  email: z.string().email(),
  role: z.enum(['APPROVER', 'COLLABORATOR']),
});
export type InviteMemberBody = z.infer<typeof InviteMemberBody>;

export const ScenarioMember = z.object({
  id: z.uuid(),
  scenarioId: z.uuid(),
  invitedEmail: z.string().email(),
  role: MemberRoleSchema,
  userId: z.string().uuid().nullable(),
  collaborationDoneAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});
export type ScenarioMember = z.infer<typeof ScenarioMember>;

export const MembersResponse = z.object({ data: z.array(ScenarioMember) });

export const ApprovalDecisionBody = z.object({
  decision: z.enum(['APPROVE', 'RETURN']),
  reason: z.string().min(1).optional(),
});
export type ApprovalDecisionBody = z.infer<typeof ApprovalDecisionBody>;
