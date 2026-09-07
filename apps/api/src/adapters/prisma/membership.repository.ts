import type { PrismaClient } from '@prisma/client';
import type { MemberRole, MembershipRepository, ScenarioMemberRecord } from '../../composition/ports.js';

function toRecord(m: {
  id: string;
  scenarioId: string;
  userId: string | null;
  invitedEmail: string;
  role: string;
  collaborationDoneAt: Date | null;
  createdAt: Date;
}): ScenarioMemberRecord {
  return {
    id: m.id,
    scenarioId: m.scenarioId,
    userId: m.userId,
    invitedEmail: m.invitedEmail,
    role: m.role as MemberRole,
    collaborationDoneAt: m.collaborationDoneAt?.toISOString() ?? null,
    createdAt: m.createdAt.toISOString(),
  };
}

export class PrismaMembershipRepository implements MembershipRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async invite(input: {
    scenarioId: string;
    invitedEmail: string;
    role: MemberRole;
  }): Promise<ScenarioMemberRecord> {
    // Tenta vincular com userId se já houver conta com esse e-mail
    const existing = await this.prisma.user.findUnique({
      where: { email: input.invitedEmail },
      select: { id: true },
    });

    const m = await this.prisma.scenarioMember.upsert({
      where: {
        scenarioId_invitedEmail_role: {
          scenarioId: input.scenarioId,
          invitedEmail: input.invitedEmail,
          role: input.role,
        },
      },
      create: {
        scenarioId: input.scenarioId,
        invitedEmail: input.invitedEmail,
        role: input.role,
        userId: existing?.id ?? null,
      },
      update: {
        userId: existing?.id ?? null,
      },
    });

    return toRecord(m);
  }

  async listMembers(scenarioId: string): Promise<ScenarioMemberRecord[]> {
    const members = await this.prisma.scenarioMember.findMany({
      where: { scenarioId },
      orderBy: { createdAt: 'asc' },
    });
    return members.map(toRecord);
  }

  async getRolesForUser(scenarioId: string, userId: string): Promise<MemberRole[]> {
    const members = await this.prisma.scenarioMember.findMany({
      where: { scenarioId, userId },
      select: { role: true },
    });
    return members.map((m) => m.role as MemberRole);
  }

  async hasApprover(scenarioId: string): Promise<boolean> {
    const count = await this.prisma.scenarioMember.count({
      where: { scenarioId, role: 'APPROVER' },
    });
    return count > 0;
  }
}
