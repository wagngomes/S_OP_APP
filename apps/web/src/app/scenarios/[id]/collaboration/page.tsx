'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  type CollaborationItemRow,
  getCollaborationSheet,
  getIngestionJob,
  listCollaborationItems,
  markCollaborationDone,
  submitAdjustment,
  uploadCollaborationSheet,
} from '../../../../lib/api';

const PAGE_SIZE = 50;

type AdjustState = {
  itemId: string;
  quantity: string;
  reason: string;
  version: number;
};

type EditMode = { itemId: string; quantity: string; reason: string };

export default function CollaborationPage() {
  const { id: scenarioId } = useParams<{ id: string }>();
  const router = useRouter();

  const [items, setItems] = useState<CollaborationItemRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Inline edit
  const [editing, setEditing] = useState<EditMode | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  // Mark done
  const [marking, setMarking] = useState(false);
  const [doneMsg, setDoneMsg] = useState('');

  // Sheet download
  const [sheetLoading, setSheetLoading] = useState(false);
  const [sheetError, setSheetError] = useState('');

  // Sheet upload
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState('');
  const [uploadError, setUploadError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const resp = await listCollaborationItems(scenarioId, {
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      });
      setItems(resp.data);
      setTotal(resp.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar itens');
    } finally {
      setLoading(false);
    }
  }, [scenarioId, page]);

  useEffect(() => { void load(); }, [load]);

  function startEdit(item: CollaborationItemRow) {
    setEditing({
      itemId: item.id,
      quantity: item.currentAdjustment?.quantity ?? item.calculatedQuantity,
      reason: item.currentAdjustment?.reason ?? '',
    });
    setSaveError('');
  }

  async function saveEdit(item: CollaborationItemRow) {
    if (!editing) return;
    if (editing.reason.trim().length < 5) {
      setSaveError('O motivo deve ter ao menos 5 caracteres.');
      return;
    }
    setSaving(true);
    setSaveError('');
    try {
      await submitAdjustment(scenarioId, {
        forecastItemId: item.id,
        quantity: editing.quantity,
        reason: editing.reason,
        expectedVersion: item.version,
      });
      setEditing(null);
      await load();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Erro ao salvar ajuste');
    } finally {
      setSaving(false);
    }
  }

  async function handleMarkDone() {
    setMarking(true);
    setDoneMsg('');
    try {
      await markCollaborationDone(scenarioId);
      setDoneMsg('Concluído! Aguardando os demais colaboradores…');
    } catch (err) {
      setDoneMsg(err instanceof Error ? err.message : 'Erro');
    } finally {
      setMarking(false);
    }
  }

  async function handleDownloadSheet() {
    setSheetLoading(true);
    setSheetError('');
    try {
      const { url } = await getCollaborationSheet(scenarioId);
      // Open in new tab — browser handles the file download from the presigned URL
      window.open(url, '_blank');
    } catch (err) {
      setSheetError(err instanceof Error ? err.message : 'Erro ao gerar planilha');
    } finally {
      setSheetLoading(false);
    }
  }

  async function handleUploadSheet(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadMsg('');
    setUploadError('');
    try {
      const { jobId } = await uploadCollaborationSheet(scenarioId, file);
      setUploadMsg('Processando planilha…');
      // Poll until done
      let done = false;
      while (!done) {
        await new Promise((r) => setTimeout(r, 2000));
        const job = await getIngestionJob(jobId);
        if (job.status === 'COMPLETED') {
          const issues = job.issueCount > 0 ? ` (${job.issueCount} aviso(s))` : '';
          setUploadMsg(`Planilha aplicada: ${job.validRows} ajuste(s)${issues}.`);
          done = true;
          await load();
        } else if (job.status === 'FAILED') {
          setUploadError(`Falha: ${job.failureReason ?? 'erro desconhecido'}`);
          setUploadMsg('');
          done = true;
        }
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Erro ao enviar planilha');
      setUploadMsg('');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function period(item: CollaborationItemRow) {
    const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    return `${months[item.month - 1] ?? item.month}/${item.year}`;
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);

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
          <h1 className="text-2xl font-bold text-titulo">Colaboração</h1>
          <p className="mt-1 text-sm text-texto-principal/60">
            Ajuste as quantidades previstas. O motivo é obrigatório para qualquer alteração.
          </p>
        </div>

        {/* Ações de planilha */}
        <div className="flex flex-col gap-2 text-right">
          <div className="flex gap-2">
            <button
              onClick={handleDownloadSheet}
              disabled={sheetLoading}
              className="rounded border border-petroleo px-3 py-1.5 text-sm font-medium text-petroleo transition hover:bg-petroleo hover:text-white disabled:opacity-40"
            >
              {sheetLoading ? 'Gerando…' : 'Baixar planilha'}
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="rounded border border-turquesa px-3 py-1.5 text-sm font-medium text-petroleo transition hover:bg-turquesa disabled:opacity-40"
            >
              {uploading ? 'Enviando…' : 'Enviar planilha'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={handleUploadSheet}
            />
          </div>
          {sheetError && <p className="text-xs text-red-600">{sheetError}</p>}
          {uploadMsg && <p className="text-xs text-petroleo">{uploadMsg}</p>}
          {uploadError && <p className="text-xs text-red-600">{uploadError}</p>}
        </div>
      </div>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {/* Tabela */}
      <div className="overflow-x-auto rounded border border-cinza">
        <table className="w-full text-sm">
          <thead className="bg-fundo-secundario text-left text-xs uppercase tracking-wide text-texto-principal/60">
            <tr>
              <th className="px-3 py-2">Produto</th>
              <th className="px-3 py-2">Período</th>
              <th className="px-3 py-2 text-right">Calculado</th>
              <th className="px-3 py-2 text-right">Ajustado</th>
              <th className="px-3 py-2">Motivo</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-texto-principal/40">
                  Carregando…
                </td>
              </tr>
            )}
            {!loading && items.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-texto-principal/40">
                  Nenhum item de previsão disponível.
                </td>
              </tr>
            )}
            {items.map((item) => {
              const isEditing = editing?.itemId === item.id;
              const displayQty = item.currentAdjustment?.quantity ?? item.calculatedQuantity;
              const hasChange = item.currentAdjustment !== null &&
                item.currentAdjustment.quantity !== item.calculatedQuantity;

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
                  <td className="px-3 py-2 text-right">
                    {isEditing ? (
                      <input
                        type="text"
                        value={editing.quantity}
                        onChange={(e) => setEditing({ ...editing, quantity: e.target.value })}
                        className="w-28 rounded border border-turquesa bg-fundo-principal px-2 py-0.5 font-mono text-xs text-texto-principal outline-none"
                      />
                    ) : (
                      <span className={`font-mono ${hasChange ? 'font-semibold text-petroleo' : ''}`}>
                        {displayQty}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-texto-principal/60">
                    {isEditing ? (
                      <input
                        type="text"
                        value={editing.reason}
                        onChange={(e) => setEditing({ ...editing, reason: e.target.value })}
                        placeholder="Motivo (obrigatório, min. 5 chars)"
                        className="w-full rounded border border-turquesa bg-fundo-principal px-2 py-0.5 text-xs text-texto-principal outline-none"
                      />
                    ) : (
                      <span className="text-xs">{item.currentAdjustment?.reason ?? '—'}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {isEditing ? (
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => void saveEdit(item)}
                          disabled={saving}
                          className="rounded bg-turquesa px-2 py-0.5 text-xs font-medium text-petroleo disabled:opacity-40"
                        >
                          {saving ? '…' : 'Salvar'}
                        </button>
                        <button
                          onClick={() => { setEditing(null); setSaveError(''); }}
                          className="rounded border border-cinza px-2 py-0.5 text-xs text-texto-principal/60"
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => startEdit(item)}
                        className="rounded border border-cinza px-2 py-0.5 text-xs text-texto-principal/60 hover:border-turquesa hover:text-petroleo"
                      >
                        Ajustar
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

      {/* Paginação */}
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

      {/* Concluir colaboração */}
      <div className="mt-8 rounded border border-cinza bg-fundo-secundario p-4">
        <p className="mb-3 text-sm text-texto-principal/70">
          Quando terminar todos os ajustes, sinalize a conclusão. A fase avança para consenso
          automaticamente quando todos os colaboradores concluírem.
        </p>
        <button
          onClick={handleMarkDone}
          disabled={marking}
          className="rounded bg-petroleo px-5 py-2.5 font-semibold text-white transition hover:opacity-90 disabled:opacity-40"
        >
          {marking ? 'Sinalizando…' : 'Concluir colaboração →'}
        </button>
        {doneMsg && (
          <p className="mt-2 text-sm text-petroleo">{doneMsg}</p>
        )}
      </div>
    </div>
  );
}
