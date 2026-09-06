'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createScenario, listScenarios, type ScenarioSummary } from '../../lib/api';

const PHASE_LABELS: Record<string, string> = {
  TEAM_SETUP: 'Montagem de equipe',
  IMPORT_SETUP: 'Importação e parametrização',
  CALCULATION: 'Cálculo em andamento',
  APPROVAL: 'Aguardando aprovação',
  COLLABORATION: 'Colaboração',
  CONSENSUS: 'Consenso',
  PUBLICATION: 'Publicado',
  ACCURACY: 'Acurácia',
};

export default function ScenariosPage() {
  const router = useRouter();
  const [scenarios, setScenarios] = useState<ScenarioSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Criação
  const [showForm, setShowForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  useEffect(() => {
    loadScenarios();
  }, []);

  async function loadScenarios() {
    setLoading(true);
    setError('');
    try {
      const res = await listScenarios({ limit: 20, offset: 0 });
      setScenarios(res.data);
      setTotal(res.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar cenários');
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateError('');
    setCreating(true);
    try {
      const created = await createScenario({ name: newName });
      setScenarios((prev) => [created, ...prev]);
      setTotal((t) => t + 1);
      setNewName('');
      setShowForm(false);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Erro ao criar cenário');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      {/* Cabeçalho */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-titulo">Cenários de S&OP</h1>
          <p className="text-sm text-texto-principal/60">
            {total} {total === 1 ? 'cenário' : 'cenários'}
          </p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="rounded bg-turquesa px-4 py-2 font-semibold text-petroleo transition hover:opacity-90"
        >
          + Novo cenário
        </button>
      </div>

      {/* Formulário de criação */}
      {showForm && (
        <form
          onSubmit={handleCreate}
          className="mb-6 rounded-lg border border-cinza bg-fundo-secundario p-4"
        >
          <h2 className="mb-3 font-semibold text-titulo">Novo cenário</h2>
          <div className="flex gap-3">
            <input
              type="text"
              required
              placeholder="Nome do cenário"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="flex-1 rounded border border-cinza bg-fundo-principal px-3 py-2 text-texto-principal outline-none focus:border-petroleo"
            />
            <button
              type="submit"
              disabled={creating}
              className="rounded bg-petroleo px-4 py-2 text-sm font-semibold text-branco transition hover:opacity-90 disabled:opacity-50"
            >
              {creating ? 'Criando…' : 'Criar'}
            </button>
            <button
              type="button"
              onClick={() => { setShowForm(false); setCreateError(''); }}
              className="rounded border border-cinza px-4 py-2 text-sm text-texto-principal transition hover:bg-cinza"
            >
              Cancelar
            </button>
          </div>
          {createError && <p className="mt-2 text-sm text-red-600">{createError}</p>}
        </form>
      )}

      {/* Lista */}
      {loading ? (
        <p className="text-center text-texto-principal/60">Carregando…</p>
      ) : error ? (
        <p className="text-center text-red-600">{error}</p>
      ) : scenarios.length === 0 ? (
        <div className="rounded-lg border border-dashed border-cinza p-12 text-center">
          <p className="text-texto-principal/60">Nenhum cenário ainda.</p>
          <p className="mt-1 text-sm text-texto-principal/40">
            Crie o primeiro clicando em "+ Novo cenário".
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {scenarios.map((s) => (
            <li
              key={s.id}
              className="flex cursor-pointer items-center justify-between rounded-lg border border-cinza bg-fundo-principal px-5 py-4 shadow-sm transition hover:border-petroleo"
              onClick={() => router.push(`/scenarios/${s.id}`)}
            >
              <div>
                <p className="font-semibold text-titulo">{s.name}</p>
                <p className="mt-0.5 text-sm text-texto-principal/60">
                  {PHASE_LABELS[s.phase] ?? s.phase}
                </p>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  s.published
                    ? 'bg-verde/10 text-verde'
                    : 'bg-fundo-secundario text-texto-principal/60'
                }`}
              >
                {s.published ? 'Publicado' : s.phase}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
