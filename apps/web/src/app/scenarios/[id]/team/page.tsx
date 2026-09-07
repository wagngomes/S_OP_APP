'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  closeTeam,
  inviteMember,
  listMembers,
  type MemberRole,
  type ScenarioMember,
} from '../../../../lib/api';
import { PhaseContext } from '../../../../components/phase/PhaseContext';

const ROLE_LABELS: Record<MemberRole, string> = {
  CREATOR: 'Criador',
  APPROVER: 'Aprovador',
  COLLABORATOR: 'Colaborador',
};

export default function TeamPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [members, setMembers] = useState<ScenarioMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Formulário de convite
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'APPROVER' | 'COLLABORATOR'>('APPROVER');
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState('');

  // Fechar equipe
  const [closing, setClosing] = useState(false);
  const [closeError, setCloseError] = useState('');

  useEffect(() => {
    loadMembers();
  }, [id]);

  async function loadMembers() {
    setLoading(true);
    setError('');
    try {
      const res = await listMembers(id);
      setMembers(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar membros');
    } finally {
      setLoading(false);
    }
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviteError('');
    setInviting(true);
    try {
      const member = await inviteMember(id, { email, role });
      setMembers((prev) => [...prev, member]);
      setEmail('');
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : 'Erro ao convidar');
    } finally {
      setInviting(false);
    }
  }

  async function handleCloseTeam() {
    setCloseError('');
    setClosing(true);
    try {
      await closeTeam(id);
      router.push('/scenarios');
    } catch (err) {
      setCloseError(err instanceof Error ? err.message : 'Erro ao fechar equipe');
    } finally {
      setClosing(false);
    }
  }

  const hasApprover = members.some((m) => m.role === 'APPROVER');

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <button
        onClick={() => router.back()}
        className="mb-4 text-sm text-texto-principal/60 hover:text-texto-principal"
      >
        ← Voltar
      </button>

      <h1 className="mb-4 text-2xl font-bold text-titulo">Montagem de equipe</h1>
      <PhaseContext phase="TEAM_SETUP" className="mb-6" />

      {/* Formulário de convite */}
      <form
        onSubmit={handleInvite}
        className="mb-8 rounded-lg border border-cinza bg-fundo-secundario p-4"
      >
        <h2 className="mb-3 font-semibold text-titulo">Convidar membro</h2>
        <div className="flex gap-3">
          <input
            type="email"
            required
            placeholder="e-mail do convidado"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="flex-1 rounded border border-cinza bg-fundo-principal px-3 py-2 text-texto-principal outline-none focus:border-petroleo"
          />
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as 'APPROVER' | 'COLLABORATOR')}
            className="rounded border border-cinza bg-fundo-principal px-3 py-2 text-texto-principal outline-none focus:border-petroleo"
          >
            <option value="APPROVER">Aprovador</option>
            <option value="COLLABORATOR">Colaborador</option>
          </select>
          <button
            type="submit"
            disabled={inviting}
            className="rounded bg-petroleo px-4 py-2 text-sm font-semibold text-branco transition hover:opacity-90 disabled:opacity-50"
          >
            {inviting ? 'Convidando…' : 'Convidar'}
          </button>
        </div>
        {inviteError && <p className="mt-2 text-sm text-red-600">{inviteError}</p>}
      </form>

      {/* Lista de membros */}
      <h2 className="mb-3 font-semibold text-titulo">Membros</h2>
      {loading ? (
        <p className="text-texto-principal/60">Carregando…</p>
      ) : error ? (
        <p className="text-red-600">{error}</p>
      ) : members.length === 0 ? (
        <p className="text-texto-principal/60">Nenhum membro ainda.</p>
      ) : (
        <ul className="mb-6 flex flex-col gap-2">
          {members.map((m) => (
            <li
              key={m.id}
              className="flex items-center justify-between rounded-lg border border-cinza bg-fundo-principal px-4 py-3"
            >
              <div>
                <p className="font-medium text-titulo">{m.invitedEmail}</p>
                {m.userId && (
                  <p className="text-xs text-verde">Conta vinculada</p>
                )}
              </div>
              <span className="rounded-full bg-fundo-secundario px-3 py-1 text-xs font-medium text-texto-principal/80">
                {ROLE_LABELS[m.role]}
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* Fechar equipe */}
      <div className="rounded-lg border border-cinza p-4">
        {!hasApprover && (
          <p className="mb-3 text-sm text-amber-600">
            Adicione ao menos um aprovador antes de fechar a equipe.
          </p>
        )}
        <button
          onClick={handleCloseTeam}
          disabled={closing || !hasApprover}
          className="rounded bg-turquesa px-5 py-2 font-semibold text-petroleo transition hover:opacity-90 disabled:opacity-40"
        >
          {closing ? 'Fechando…' : 'Fechar equipe'}
        </button>
        {closeError && <p className="mt-2 text-sm text-red-600">{closeError}</p>}
      </div>
    </div>
  );
}
