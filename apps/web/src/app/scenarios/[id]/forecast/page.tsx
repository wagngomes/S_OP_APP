'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  getForecastJob,
  listForecastItems,
  type ForecastJobStatus,
  type ForecastItemRow,
} from '../../../../lib/api';

const JOB_STATUS_LABEL: Record<ForecastJobStatus['status'], string> = {
  PENDING: 'Aguardando processamento…',
  PROCESSING: 'Calculando previsão…',
  COMPLETED: 'Concluído',
  FAILED: 'Falhou',
};

const MONTH_NAMES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

export default function ForecastPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const jobId = searchParams.get('jobId');

  const [jobStatus, setJobStatus] = useState<ForecastJobStatus | null>(null);
  const [jobDone, setJobDone] = useState(false);
  const [jobError, setJobError] = useState('');

  const [items, setItems] = useState<ForecastItemRow[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loadingItems, setLoadingItems] = useState(false);
  const [itemsError, setItemsError] = useState('');

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const LIMIT = 50;

  useEffect(() => {
    if (!jobId) {
      // Sem jobId: tenta buscar itens diretamente (cenário já calculado)
      loadItems(0);
      return;
    }

    // Com jobId: faz polling do status até terminar
    pollingRef.current = setInterval(async () => {
      try {
        const status = await getForecastJob(id, jobId);
        setJobStatus(status);
        if (status.status === 'COMPLETED') {
          clearInterval(pollingRef.current!);
          setJobDone(true);
          loadItems(0);
        } else if (status.status === 'FAILED') {
          clearInterval(pollingRef.current!);
          setJobDone(true);
          setJobError(status.failureReason ?? 'O cálculo falhou.');
        }
      } catch {
        // transient — keep polling
      }
    }, 3000);

    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, [id, jobId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadItems(newOffset: number) {
    setLoadingItems(true);
    setItemsError('');
    try {
      const res = await listForecastItems(id, { limit: LIMIT, offset: newOffset });
      setItems(res.data);
      setTotal(res.total);
      setOffset(newOffset);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao carregar itens';
      // 409 = job ainda rodando — não é erro de UI
      if (!msg.includes('ainda está em andamento')) setItemsError(msg);
    } finally {
      setLoadingItems(false);
    }
  }

  const isPolling = jobId && !jobDone;
  const showResults = !isPolling && items.length > 0;
  const totalPages = Math.ceil(total / LIMIT);
  const currentPage = Math.floor(offset / LIMIT) + 1;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <button onClick={() => router.push('/scenarios')} className="mb-4 text-sm text-texto-principal/60 hover:text-texto-principal">
        ← Cenários
      </button>

      <h1 className="mb-6 text-2xl font-bold text-titulo">Resultado da previsão</h1>

      {/* Status do job */}
      {jobId && jobStatus && (
        <div className={`mb-6 rounded-lg border p-4 ${jobStatus.status === 'FAILED' ? 'border-red-300 bg-red-50' : jobStatus.status === 'COMPLETED' ? 'border-verde bg-fundo-secundario' : 'border-cinza bg-fundo-secundario'}`}>
          <div className="flex items-center gap-3">
            {isPolling && (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-petroleo border-t-transparent" />
            )}
            <p className="font-medium text-titulo">{JOB_STATUS_LABEL[jobStatus.status]}</p>
          </div>
          {jobStatus.startedAt && jobStatus.finishedAt && (
            <p className="mt-1 text-xs text-texto-principal/60">
              Duração: {Math.round((new Date(jobStatus.finishedAt).getTime() - new Date(jobStatus.startedAt).getTime()) / 1000)}s
            </p>
          )}
          {jobError && <p className="mt-2 text-sm text-red-600">{jobError}</p>}
        </div>
      )}

      {/* Polling sem jobId */}
      {!jobId && loadingItems && items.length === 0 && (
        <div className="flex items-center justify-center py-16">
          <p className="text-texto-principal/60">Carregando itens…</p>
        </div>
      )}

      {/* Erro */}
      {itemsError && <p className="mb-4 text-sm text-red-600">{itemsError}</p>}

      {/* Tabela de resultados */}
      {showResults && (
        <div>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm text-texto-principal/60">
              {total.toLocaleString()} itens no total — exibindo {offset + 1}–{Math.min(offset + LIMIT, total)}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => loadItems(offset - LIMIT)}
                disabled={offset === 0}
                className="rounded border border-cinza px-3 py-1 text-sm text-texto-principal transition hover:border-petroleo disabled:opacity-30"
              >
                ← Anterior
              </button>
              <span className="px-2 py-1 text-sm text-texto-principal/60">{currentPage}/{totalPages}</span>
              <button
                onClick={() => loadItems(offset + LIMIT)}
                disabled={offset + LIMIT >= total}
                className="rounded border border-cinza px-3 py-1 text-sm text-texto-principal transition hover:border-petroleo disabled:opacity-30"
              >
                Próxima →
              </button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border border-cinza">
            <table className="w-full text-sm">
              <thead className="bg-fundo-secundario">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-texto-principal/60">Produto</th>
                  {items[0]?.segments.map((_, i) => (
                    <th key={i} className="px-3 py-2 text-left text-xs font-medium text-texto-principal/60">
                      Seg. {i + 1}
                    </th>
                  ))}
                  <th className="px-3 py-2 text-left text-xs font-medium text-texto-principal/60">Período</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-texto-principal/60">Previsão</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-texto-principal/60">Modelo</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-texto-principal/60">Erro</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-t border-cinza hover:bg-fundo-secundario/50">
                    <td className="px-3 py-2 font-mono text-xs text-texto-principal">{item.productCode}</td>
                    {item.segments.map((seg, i) => (
                      <td key={i} className="px-3 py-2 text-texto-principal/70">{seg}</td>
                    ))}
                    <td className="px-3 py-2 text-texto-principal/70">
                      {MONTH_NAMES[item.month - 1]}/{item.year}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-texto-principal">{item.quantity}</td>
                    <td className="px-3 py-2 text-xs text-texto-principal/60">{item.winnerModel}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs text-texto-principal/60">
                      {item.metricValue ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-6 flex justify-end">
            <button
              onClick={() => router.push(`/scenarios/${id}/team`)}
              className="rounded bg-petroleo px-6 py-2 font-semibold text-branco transition hover:opacity-90"
            >
              Montar equipe →
            </button>
          </div>
        </div>
      )}

      {/* Sem resultados ainda */}
      {!isPolling && !loadingItems && items.length === 0 && !itemsError && (
        <div className="rounded-lg border border-cinza p-8 text-center">
          <p className="text-texto-principal/60">Nenhum item de previsão disponível.</p>
          <p className="mt-1 text-sm text-texto-principal/40">O cálculo pode ainda estar em andamento.</p>
        </div>
      )}
    </div>
  );
}
