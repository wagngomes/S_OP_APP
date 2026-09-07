'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { submitApprovalDecision } from '../../../../lib/api';
import { PhaseContext } from '../../../../components/phase/PhaseContext';

export default function ApprovalPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [decision, setDecision] = useState<'APPROVE' | 'RETURN' | null>(null);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!decision) return;

    if (decision === 'RETURN' && reason.trim().length === 0) {
      setError('O motivo é obrigatório para devolver a previsão.');
      return;
    }

    setError('');
    setSubmitting(true);
    try {
      await submitApprovalDecision(id, { decision, reason: decision === 'RETURN' ? reason : undefined });
      router.push(`/scenarios/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao enviar decisão');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-8">
      <button
        onClick={() => router.back()}
        className="mb-4 text-sm text-texto-principal/60 hover:text-texto-principal"
      >
        ← Voltar
      </button>

      <h1 className="mb-2 text-2xl font-bold text-titulo">Revisão e aprovação</h1>
      <PhaseContext phase="APPROVAL" className="mb-4" />
      <p className="mb-6 text-sm text-texto-principal/60">
        Avalie a previsão calculada e registre sua decisão.
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        {/* Seleção de decisão */}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setDecision('APPROVE')}
            className={`flex-1 rounded-lg border-2 py-4 font-semibold transition ${
              decision === 'APPROVE'
                ? 'border-verde bg-verde/10 text-verde'
                : 'border-cinza bg-fundo-principal text-texto-principal/60 hover:border-verde/50'
            }`}
          >
            ✓ Aprovar
          </button>
          <button
            type="button"
            onClick={() => setDecision('RETURN')}
            className={`flex-1 rounded-lg border-2 py-4 font-semibold transition ${
              decision === 'RETURN'
                ? 'border-red-500 bg-red-50 text-red-700'
                : 'border-cinza bg-fundo-principal text-texto-principal/60 hover:border-red-300'
            }`}
          >
            ✗ Devolver
          </button>
        </div>

        {/* Motivo (obrigatório para RETURN) */}
        {decision === 'RETURN' && (
          <div>
            <label
              className="mb-1 block text-sm font-medium text-texto-principal"
              htmlFor="reason"
            >
              Motivo da devolução <span className="text-red-500">*</span>
            </label>
            <textarea
              id="reason"
              required
              rows={4}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Descreva o que precisa ser revisado antes de um novo cálculo…"
              className="w-full rounded border border-cinza bg-fundo-principal px-3 py-2 text-texto-principal outline-none focus:border-petroleo"
            />
          </div>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={!decision || submitting}
          className="rounded bg-turquesa px-4 py-3 font-semibold text-petroleo transition hover:opacity-90 disabled:opacity-40"
        >
          {submitting
            ? 'Enviando…'
            : decision === 'APPROVE'
            ? 'Confirmar aprovação'
            : decision === 'RETURN'
            ? 'Confirmar devolução'
            : 'Selecione uma decisão'}
        </button>
      </form>
    </div>
  );
}
