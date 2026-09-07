'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { type PublishedForecastRow, listPublishedForecast } from '../../../../lib/api';

const PAGE_SIZE = 100;

export default function PublishedPage() {
  const { id: scenarioId } = useParams<{ id: string }>();
  const router = useRouter();

  const [items, setItems] = useState<PublishedForecastRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const resp = await listPublishedForecast(scenarioId, {
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      });
      setItems(resp.data);
      setTotal(resp.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar previsão publicada');
    } finally {
      setLoading(false);
    }
  }, [scenarioId, page]);

  useEffect(() => { void load(); }, [load]);

  function period(item: PublishedForecastRow) {
    const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    return `${months[item.month - 1] ?? item.month}/${item.year}`;
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <button
        onClick={() => router.back()}
        className="mb-4 text-sm text-texto-principal/60 hover:text-texto-principal"
      >
        ← Voltar
      </button>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-titulo">Previsão Publicada</h1>
        <p className="mt-1 text-sm text-texto-principal/60">
          Previsão oficial do ciclo S&OP — somente leitura. Total: {total} item(s).
        </p>
      </div>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      <div className="overflow-x-auto rounded border border-cinza">
        <table className="w-full text-sm">
          <thead className="bg-fundo-secundario text-left text-xs uppercase tracking-wide text-texto-principal/60">
            <tr>
              <th className="px-3 py-2">Produto</th>
              <th className="px-3 py-2">Segmentos</th>
              <th className="px-3 py-2">Período</th>
              <th className="px-3 py-2 text-right">Quantidade</th>
              <th className="px-3 py-2">Publicado em</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-texto-principal/40">
                  Carregando…
                </td>
              </tr>
            )}
            {!loading && items.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-texto-principal/40">
                  Nenhum item publicado encontrado.
                </td>
              </tr>
            )}
            {items.map((item) => (
              <tr key={item.id} className="border-t border-cinza hover:bg-fundo-secundario/50">
                <td className="px-3 py-2 font-mono text-xs">{item.productCode}</td>
                <td className="px-3 py-2 text-xs text-texto-principal/60">
                  {item.segments.length > 0 ? item.segments.join(' · ') : '—'}
                </td>
                <td className="px-3 py-2 text-texto-principal/60">{period(item)}</td>
                <td className="px-3 py-2 text-right font-mono font-semibold text-petroleo">
                  {item.quantity}
                </td>
                <td className="px-3 py-2 text-xs text-texto-principal/50">
                  {new Date(item.publishedAt).toLocaleString('pt-BR', {
                    dateStyle: 'short',
                    timeStyle: 'short',
                  })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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
    </div>
  );
}
