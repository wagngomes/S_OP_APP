'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  type ConsensusItemRow,
  decideConsensusItem,
  listConsensusItems,
  publishConsensus,
} from '../../../../lib/api';

const PAGE_SIZE = 50;

type Source = 'CALCULATED' | 'COLLABORATED' | 'MANUAL';

type DecideState = {
  itemId: string;
  source: Source;
  quantity: string;
  reason: string;
};

export default function ConsensusPage() {
  const { id: scenarioId } = useParams<{ id: string }>();
  const router = useRouter();

  const [items, setItems] = useState<ConsensusItemRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [sortByDelta, setSortByDelta] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [deciding, setDeciding] = useState<DecideState | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const [publishing, setPublishing] = useState(false);
  const [publishMsg, setPublishMsg] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const resp = await listConsensusItems(scenarioId, {
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
        sort: sortByDelta ? 'delta_desc' : 'default',
      });
      setItems(resp.data);
      setTotal(resp.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar itens');
    } finally {
      setLoading(false);
    }
  }, [scenarioId, page, sortByDelta]);

  useEffect(() => { void load(); }, [load]);

  function startDecide(item: ConsensusItemRow) {
    const defaultSource: Source = item.collaboratedQuantity ? 'COLLABORATED' : 'CALCULATED';
    const qty = item.currentDecision?.quantity
      ?? (defaultSource === 'COLLABORATED' ? (item.collaboratedQuantity ?? item.calculatedQuantity) : item.calculatedQuantity);
    setDeciding({
      itemId: item.id,
      source: item.currentDecision?.source ?? defaultSource,
      quantity: qty,
      reason: item.currentDecision?.reason ?? '',
    });
    setSaveError('');
  }

  function onSourceChange(source: Source, item: ConsensusItemRow) {
    if (!deciding) return;
    let qty = deciding.quantity;
    if (source === 'CALCULATED') qty = item.calculatedQuantity;
    else if (source === 'COLLABORATED') qty = item.collaboratedQuantity ?? item.calculatedQuantity;
    setDeciding({ ...deciding, source, quantity: qty });
  }

  async function saveDecision(item: ConsensusItemRow) {
    if (!deciding) return;
    if (deciding.source === 'MANUAL' && deciding.reason.trim().length < 5) {
      setSaveError('Justificativa obrigatória para valor manual (mín. 5 caracteres).');
      return;
    }
    setSaving(true);
    setSaveError('');
    try {
      await decideConsensusItem(scenarioId, {
        forecastItemId: item.id,
        source: deciding.source,
        quantity: deciding.quantity,
        ...(deciding.reason.trim() ? { reason: deciding.reason.trim() } : {}),
      });
      setDeciding(null);
      await load();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Erro ao registrar decisão');
    } finally {
      setSaving(false);
    }
  }

  async function handlePublish() {
    setPublishing(true);
    setPublishMsg('');
    try {
      await publishConsensus(scenarioId);
      setPublishMsg('Previsão publicada com sucesso!');
      setTimeout(() => router.replace(`/scenarios/${scenarioId}/published`), 1500);
    } catch (err) {
      setPublishMsg(err instanceof Error ? err.message : 'Erro ao publicar');
    } finally {
      setPublishing(false);
    }
  }

  function period(item: ConsensusItemRow) {
    const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    return `${months[item.month - 1] ?? item.month}/${item.year}`;
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const decidedCount = items.filter((i) => i.currentDecision !== null).length;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <button
        onClick={() => router.back()}
        className="mb-4 text-sm text-texto-principal/60 hover:text-texto-principal"
      >
        ← Voltar
      </button>

      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-titulo">Consenso</h1>
          <p className="mt-1 text-sm text-texto-principal/60">
            Registre a decisão para cada item. Decididos: {decidedCount}/{items.length}
            {total > PAGE_SIZE && ` (nesta página)`}.
          </p>
        </div>

        <button
          onClick={() => { setSortByDelta((v) => !v); setPage(0); }}
          className={`rounded border px-3 py-1.5 text-sm font-medium transition ${
            sortByDelta
              ? 'border-petroleo bg-petroleo text-white'
              : 'border-cinza text-texto-principal/70 hover:border-petroleo hover:text-petroleo'
          }`}
        >
          {sortByDelta ? 'Ordenado por divergência' : 'Ordenar por divergência'}
        </button>
      </div>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      <div className="overflow-x-auto rounded border border-cinza">
        <table className="w-full text-sm">
          <thead className="bg-fundo-secundario text-left text-xs uppercase tracking-wide text-texto-principal/60">
            <tr>
              <th className="px-3 py-2">Produto</th>
              <th className="px-3 py-2">Período</th>
              <th className="px-3 py-2 text-right">Calculado</th>
              <th className="px-3 py-2 text-right">Colaborado</th>
              <th className="px-3 py-2 text-right">Δ</th>
              <th className="px-3 py-2 text-right">Decidido</th>
              <th className="px-3 py-2 text-center">Status</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-texto-principal/40">
                  Carregando…
                </td>
              </tr>
            )}
            {!loading && items.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-texto-principal/40">
                  Nenhum item de previsão disponível.
                </td>
              </tr>
            )}
            {items.map((item) => {
              const isDeciding = deciding?.itemId === item.id;
              const decided = item.currentDecision;

              return (
                <tr key={item.id} className="border-t border-cinza hover:bg-fundo-secundario/50">
                  <td className="px-3 py-2 font-mono text-xs">
                    {item.productCode}
                    {item.segments.length > 0 && (
                      <span className="ml-1 text-texto-principal/40">
                        [{item.segments.join(' · ')}]
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-texto-principal/60">{period(item)}</td>
                  <td className="px-3 py-2 text-right font-mono text-texto-principal/60">
                    {item.calculatedQuantity}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-texto-principal/60">
                    {item.collaboratedQuantity ?? '—'}
                  </td>
                  <td className={`px-3 py-2 text-right font-mono text-xs ${
                    item.withinTolerance ? 'text-green-600' : 'text-amber-600'
                  }`}>
                    {item.divergence.absolute !== '0.000000'
                      ? (item.divergence.signed.startsWith('-') ? '' : '+') + item.divergence.signed
                      : '—'}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {isDeciding ? (
                      <div className="flex flex-col gap-1">
                        <select
                          value={deciding.source}
                          onChange={(e) => onSourceChange(e.target.value as Source, item)}
                          className="rounded border border-turquesa bg-fundo-principal px-1 py-0.5 text-xs text-texto-principal outline-none"
                        >
                          <option value="CALCULATED">Calculado</option>
                          {item.collaboratedQuantity && (
                            <option value="COLLABORATED">Colaborado</option>
                          )}
                          <option value="MANUAL">Manual</option>
                        </select>
                        {deciding.source === 'MANUAL' && (
                          <input
                            type="text"
                            value={deciding.quantity}
                            onChange={(e) => setDeciding({ ...deciding, quantity: e.target.value })}
                            className="w-28 rounded border border-turquesa bg-fundo-principal px-2 py-0.5 font-mono text-xs outline-none"
                          />
                        )}
                        {deciding.source === 'MANUAL' && (
                          <input
                            type="text"
                            value={deciding.reason}
                            onChange={(e) => setDeciding({ ...deciding, reason: e.target.value })}
                            placeholder="Justificativa (obrigatório)"
                            className="w-full rounded border border-turquesa bg-fundo-principal px-2 py-0.5 text-xs outline-none"
                          />
                        )}
                      </div>
                    ) : (
                      <span className={`font-mono ${decided ? 'font-semibold text-petroleo' : 'text-texto-principal/30'}`}>
                        {decided?.quantity ?? '—'}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {decided ? (
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">
                        {decided.source === 'CALCULATED' ? 'Calc' : decided.source === 'COLLABORATED' ? 'Colab' : 'Manual'}
                      </span>
                    ) : (
                      <span className="rounded-full bg-cinza px-2 py-0.5 text-xs text-texto-principal/40">
                        Pendente
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {isDeciding ? (
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => void saveDecision(item)}
                          disabled={saving}
                          className="rounded bg-turquesa px-2 py-0.5 text-xs font-medium text-petroleo disabled:opacity-40"
                        >
                          {saving ? '…' : 'Confirmar'}
                        </button>
                        <button
                          onClick={() => { setDeciding(null); setSaveError(''); }}
                          className="rounded border border-cinza px-2 py-0.5 text-xs text-texto-principal/60"
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => startDecide(item)}
                        className="rounded border border-cinza px-2 py-0.5 text-xs text-texto-principal/60 hover:border-turquesa hover:text-petroleo"
                      >
                        {decided ? 'Rever' : 'Decidir'}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {saveError && <p className="mt-2 text-xs text-red-600">{saveError}</p>}

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-4">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="rounded border border-cinza px-3 py-1 text-sm disabled:opacity-40"
          >
            Anterior
          </button>
          <span className="text-sm text-texto-principal/60">
            Página {page + 1} de {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="rounded border border-cinza px-3 py-1 text-sm disabled:opacity-40"
          >
            Próxima
          </button>
        </div>
      )}

      <div className="mt-8 rounded border border-cinza bg-fundo-secundario p-4">
        <p className="mb-3 text-sm text-texto-principal/70">
          Após revisar todas as decisões, publique a previsão consensada. Esta ação é irreversível.
        </p>
        <button
          onClick={handlePublish}
          disabled={publishing}
          className="rounded bg-petroleo px-5 py-2.5 font-semibold text-white transition hover:opacity-90 disabled:opacity-40"
        >
          {publishing ? 'Publicando…' : 'Publicar previsão →'}
        </button>
        {publishMsg && (
          <p className={`mt-2 text-sm ${publishMsg.includes('sucesso') ? 'text-green-600' : 'text-red-600'}`}>
            {publishMsg}
          </p>
        )}
      </div>
    </div>
  );
}
