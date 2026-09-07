'use client';

import { useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  uploadDataset,
  getIngestionJob,
  listIngestionIssues,
  type IngestionJobStatus,
  type IngestionIssueItem,
} from '../../../../lib/api';

type UploadPhase = 'IDLE' | 'UPLOADING' | 'POLLING' | 'DONE' | 'FAILED';

const STATUS_LABEL: Record<IngestionJobStatus['status'], string> = {
  PENDING: 'Aguardando worker…',
  PROCESSING: 'Processando…',
  COMPLETED: 'Concluído',
  FAILED: 'Falhou',
};

export default function UploadPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const fileRef = useRef<HTMLInputElement>(null);
  const [labels, setLabels] = useState('');
  const [phase, setPhase] = useState<UploadPhase>('IDLE');
  const [error, setError] = useState('');
  const [job, setJob] = useState<IngestionJobStatus | null>(null);
  const [issues, setIssues] = useState<IngestionIssueItem[]>([]);
  const [issuesTotal, setIssuesTotal] = useState(0);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) { setError('Selecione um arquivo CSV.'); return; }

    setError('');
    setPhase('UPLOADING');
    setJob(null);
    setIssues([]);

    let jobId: string;
    try {
      const parsed = labels.split(';').map((s) => s.trim()).filter(Boolean);
      const res = await uploadDataset(id, file, parsed);
      jobId = res.jobId;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro no upload');
      setPhase('FAILED');
      return;
    }

    setPhase('POLLING');
    await pollJob(jobId);
  }

  async function pollJob(jobId: string) {
    const interval = setInterval(async () => {
      try {
        const status = await getIngestionJob(jobId);
        setJob(status);
        if (status.status === 'COMPLETED' || status.status === 'FAILED') {
          clearInterval(interval);
          if (status.status === 'FAILED') {
            setPhase('FAILED');
            setError(status.failureReason ?? 'O worker falhou ao processar o arquivo.');
          } else {
            setPhase('DONE');
            if (status.issueCount > 0) {
              const issueData = await listIngestionIssues(jobId, { limit: 100 });
              setIssues(issueData.data);
              setIssuesTotal(issueData.total);
            }
          }
        }
      } catch {
        // transient error — keep polling
      }
    }, 2000);
  }

  const canContinue = phase === 'DONE' && job && job.invalidRows === 0;
  const canContinueWithWarning = phase === 'DONE' && job && job.invalidRows > 0 && job.validRows > 0;

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <button
        onClick={() => router.back()}
        className="mb-4 text-sm text-texto-principal/60 hover:text-texto-principal"
      >
        ← Voltar
      </button>

      <h1 className="mb-6 text-2xl font-bold text-titulo">Importar histórico de vendas</h1>

      {/* Formulário de upload */}
      {phase === 'IDLE' || phase === 'FAILED' ? (
        <form onSubmit={handleUpload} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-titulo">
              Rótulos dos níveis (separados por ponto-e-vírgula)
            </label>
            <input
              type="text"
              placeholder="Ex: BU;CD;SKU"
              value={labels}
              onChange={(e) => setLabels(e.target.value)}
              className="w-full rounded border border-cinza bg-fundo-principal px-3 py-2 text-texto-principal outline-none focus:border-petroleo"
            />
            <p className="mt-1 text-xs text-texto-principal/50">
              Devem corresponder às colunas de segmentação do CSV, na mesma ordem.
            </p>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-titulo">Arquivo CSV</label>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              required
              className="w-full text-sm text-texto-principal file:mr-3 file:rounded file:border-0 file:bg-petroleo file:px-4 file:py-2 file:text-sm file:font-semibold file:text-branco"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            className="rounded bg-petroleo px-6 py-2 font-semibold text-branco transition hover:opacity-90"
          >
            Enviar arquivo
          </button>
        </form>
      ) : null}

      {/* Progresso */}
      {(phase === 'UPLOADING' || phase === 'POLLING') && (
        <div className="rounded-lg border border-cinza bg-fundo-secundario p-6 text-center">
          <div className="mb-3 h-2 w-full overflow-hidden rounded-full bg-cinza">
            <div className="h-full w-full animate-pulse rounded-full bg-petroleo" />
          </div>
          <p className="text-texto-principal/70">
            {phase === 'UPLOADING' ? 'Enviando arquivo…' : job ? STATUS_LABEL[job.status] : 'Aguardando…'}
          </p>
        </div>
      )}

      {/* Resultado */}
      {(phase === 'DONE' || phase === 'FAILED') && job && (
        <div className="mt-6 space-y-4">
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: 'Total de linhas', value: job.totalRows },
              { label: 'Válidas', value: job.validRows },
              { label: 'Inválidas', value: job.invalidRows },
              { label: 'Problemas', value: job.issueCount },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-lg border border-cinza bg-fundo-secundario p-3 text-center">
                <p className="text-2xl font-bold text-titulo">{value}</p>
                <p className="mt-1 text-xs text-texto-principal/60">{label}</p>
              </div>
            ))}
          </div>

          {job.issueCapReached && (
            <p className="text-sm text-amber-600">
              O relatório de problemas atingiu o limite máximo — pode haver mais linhas inválidas.
            </p>
          )}

          {/* Tabela de issues */}
          {issues.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-cinza">
              <p className="border-b border-cinza px-4 py-2 text-sm font-medium text-titulo">
                Problemas encontrados {issuesTotal > issues.length ? `(exibindo ${issues.length} de ${issuesTotal})` : `(${issuesTotal})`}
              </p>
              <table className="w-full text-sm">
                <thead className="bg-fundo-secundario">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-texto-principal/60">Linha</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-texto-principal/60">Coluna</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-texto-principal/60">Código</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-texto-principal/60">Detalhe</th>
                  </tr>
                </thead>
                <tbody>
                  {issues.map((issue) => (
                    <tr key={issue.id} className="border-t border-cinza">
                      <td className="px-3 py-2 text-texto-principal">{issue.lineNumber}</td>
                      <td className="px-3 py-2 text-texto-principal/70">{issue.column ?? '—'}</td>
                      <td className="px-3 py-2 font-mono text-xs text-texto-principal/70">{issue.code}</td>
                      <td className="px-3 py-2 text-texto-principal/70">{issue.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-3">
            {(canContinue || canContinueWithWarning) && (
              <button
                onClick={() => router.push(`/scenarios/${id}/parameters`)}
                className="rounded bg-petroleo px-6 py-2 font-semibold text-branco transition hover:opacity-90"
              >
                {canContinueWithWarning ? 'Continuar mesmo com problemas' : 'Continuar para parametrização →'}
              </button>
            )}
            <button
              onClick={() => { setPhase('IDLE'); setJob(null); setIssues([]); setError(''); }}
              className="rounded border border-cinza px-4 py-2 text-sm text-texto-principal transition hover:border-petroleo"
            >
              Enviar outro arquivo
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
