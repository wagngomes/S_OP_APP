'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  getLevels,
  getModelPackages,
  getSeriesPreview,
  saveParameters,
  triggerForecast,
  getScenario,
  type SegmentationLevel,
  type ModelPackageInfo,
  type SeriesPreview,
} from '../../../../lib/api';

const METRIC_LABELS = { WMAPE: 'WMAPE', MAPE: 'MAPE', BIAS: 'BIAS' };
const MAGNITUDE_LABELS = {
  SECONDS: 'segundos',
  MINUTES: 'minutos',
  TENS_OF_MINUTES: 'dezenas de minutos',
  HOURS: 'horas',
};

export default function ParametersPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [levels, setLevels] = useState<SegmentationLevel[]>([]);
  const [packages, setPackages] = useState<ModelPackageInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  // Seleção de níveis (ordenada) — arrastar via botões ↑/↓
  const [selected, setSelected] = useState<SegmentationLevel[]>([]);

  const [modelPackage, setModelPackage] = useState<'FAST' | 'STANDARD' | 'COMPLETE'>('STANDARD');
  const [accuracyMetric, setAccuracyMetric] = useState<'WMAPE' | 'MAPE' | 'BIAS'>('WMAPE');
  const [prorationMonths, setProrationMonths] = useState(12);
  const [horizonMonths, setHorizonMonths] = useState(12);

  const [preview, setPreview] = useState<SeriesPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);

  useEffect(() => {
    Promise.all([getLevels(id), getModelPackages(), getScenario(id)])
      .then(([lvl, pkg, scenario]) => {
        setLevels(lvl.data);
        setPackages(pkg.data);
        setHorizonMonths(scenario.forecastHorizonMonths);
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : 'Erro ao carregar'))
      .finally(() => setLoading(false));
  }, [id]);

  const fetchPreview = useCallback(
    (levelIds: string[], pkg: 'FAST' | 'STANDARD' | 'COMPLETE') => {
      if (previewTimer.current) clearTimeout(previewTimer.current);
      previewTimer.current = setTimeout(async () => {
        setPreviewLoading(true);
        try {
          const p = await getSeriesPreview(id, levelIds, pkg);
          setPreview(p);
        } catch {
          setPreview(null);
        } finally {
          setPreviewLoading(false);
        }
      }, 500);
    },
    [id],
  );

  useEffect(() => {
    fetchPreview(selected.map((l) => l.id), modelPackage);
  }, [selected, modelPackage, fetchPreview]);

  function toggleLevel(level: SegmentationLevel) {
    setSelected((prev) => {
      const exists = prev.find((l) => l.id === level.id);
      return exists ? prev.filter((l) => l.id !== level.id) : [...prev, level];
    });
  }

  function moveUp(index: number) {
    if (index === 0) return;
    setSelected((prev) => {
      const next = [...prev];
      const tmp = next[index - 1]!;
      next[index - 1] = next[index]!;
      next[index] = tmp;
      return next;
    });
  }

  function moveDown(index: number) {
    setSelected((prev) => {
      if (index >= prev.length - 1) return prev;
      const next = [...prev];
      const tmp = next[index]!;
      next[index] = next[index + 1]!;
      next[index + 1] = tmp;
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (selected.length === 0) { setSaveError('Selecione ao menos um nível de agrupamento.'); return; }

    setSaveError('');
    setWarnings([]);
    setSaving(true);

    try {
      const params = await saveParameters(id, {
        groupingLevelIds: selected.map((l) => l.id),
        prorationMonths,
        accuracyMetric,
        modelPackage,
        horizonMonths,
      });

      const warns: string[] = [];
      if (params.zeroHeavyWarning) warns.push('Muitos meses com venda zero — MAPE pode ser instável. Considere usar WMAPE.');
      if (!params.prorationRequired) warns.push('A combinação já está na granularidade original; o rateio não será aplicado.');
      setWarnings(warns);

      const { jobId } = await triggerForecast(id);
      router.push(`/scenarios/${id}/forecast?jobId=${jobId}`);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Erro ao salvar');
      setSaving(false);
    }
  }

  if (loading) return <div className="flex min-h-screen items-center justify-center"><p className="text-texto-principal/60">Carregando…</p></div>;
  if (loadError) return <div className="p-8"><p className="text-red-600">{loadError}</p></div>;

  const availableLevels = levels.filter((l) => !selected.find((s) => s.id === l.id));

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <button onClick={() => router.back()} className="mb-4 text-sm text-texto-principal/60 hover:text-texto-principal">
        ← Voltar
      </button>

      <h1 className="mb-6 text-2xl font-bold text-titulo">Parametrização do cálculo</h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Seleção de níveis */}
        <section className="rounded-lg border border-cinza bg-fundo-secundario p-4">
          <h2 className="mb-3 font-semibold text-titulo">Agrupamento (níveis de previsão)</h2>

          {/* Disponíveis */}
          {availableLevels.length > 0 && (
            <div className="mb-3">
              <p className="mb-2 text-xs text-texto-principal/60">Disponíveis — clique para adicionar</p>
              <div className="flex flex-wrap gap-2">
                {availableLevels.map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => toggleLevel(l)}
                    className="rounded-full border border-cinza bg-fundo-principal px-3 py-1 text-sm text-texto-principal transition hover:border-petroleo hover:text-petroleo"
                  >
                    + {l.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Selecionados (ordenados) */}
          <div>
            <p className="mb-2 text-xs text-texto-principal/60">
              Selecionados {selected.length > 0 ? `(${selected.length})` : '— nenhum'} — use ↑/↓ para ordenar
            </p>
            {selected.length === 0 ? (
              <p className="rounded border-2 border-dashed border-cinza p-3 text-center text-sm text-texto-principal/40">
                Nenhum nível selecionado
              </p>
            ) : (
              <ul className="space-y-1">
                {selected.map((l, i) => (
                  <li key={l.id} className="flex items-center gap-2 rounded-lg border border-cinza bg-fundo-principal px-3 py-2">
                    <span className="flex-1 text-sm font-medium text-titulo">{l.label}</span>
                    <button type="button" onClick={() => moveUp(i)} disabled={i === 0} className="text-texto-principal/40 hover:text-texto-principal disabled:opacity-20">↑</button>
                    <button type="button" onClick={() => moveDown(i)} disabled={i === selected.length - 1} className="text-texto-principal/40 hover:text-texto-principal disabled:opacity-20">↓</button>
                    <button type="button" onClick={() => toggleLevel(l)} className="text-red-400 hover:text-red-600">✕</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* Prévia de custo */}
        {(preview || previewLoading) && (
          <section className="rounded-lg border border-turquesa bg-fundo-secundario p-4">
            <h2 className="mb-2 font-semibold text-titulo">Estimativa</h2>
            {previewLoading ? (
              <p className="text-sm text-texto-principal/60">Calculando…</p>
            ) : preview ? (
              <div className="grid grid-cols-3 gap-3 text-center">
                <div>
                  <p className="text-xl font-bold text-petroleo">{preview.seriesCount.toLocaleString()}</p>
                  <p className="text-xs text-texto-principal/60">séries</p>
                </div>
                <div>
                  <p className="text-xl font-bold text-petroleo">{preview.modelsEvaluated}</p>
                  <p className="text-xs text-texto-principal/60">modelos avaliados</p>
                </div>
                <div>
                  <p className="text-xl font-bold text-petroleo capitalize">
                    {MAGNITUDE_LABELS[preview.magnitude]}
                  </p>
                  <p className="text-xs text-texto-principal/60">tempo estimado</p>
                </div>
              </div>
            ) : null}
          </section>
        )}

        {/* Pacote de modelos */}
        <section className="rounded-lg border border-cinza bg-fundo-secundario p-4">
          <h2 className="mb-3 font-semibold text-titulo">Pacote de modelos</h2>
          <div className="space-y-2">
            {packages.map((pkg) => (
              <label
                key={pkg.id}
                className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition ${modelPackage === pkg.id ? 'border-petroleo bg-fundo-principal' : 'border-cinza hover:border-petroleo/50'}`}
              >
                <input
                  type="radio"
                  name="modelPackage"
                  value={pkg.id}
                  checked={modelPackage === pkg.id}
                  onChange={() => setModelPackage(pkg.id)}
                  className="mt-0.5 accent-petroleo"
                />
                <div>
                  <p className="font-medium text-titulo">{pkg.label}</p>
                  <p className="text-xs text-texto-principal/60">{pkg.tradeoff}</p>
                  <p className="mt-1 text-xs text-texto-principal/50">{pkg.models.join(', ')}</p>
                </div>
              </label>
            ))}
          </div>
        </section>

        {/* Métrica de acuracidade */}
        <section className="rounded-lg border border-cinza bg-fundo-secundario p-4">
          <h2 className="mb-3 font-semibold text-titulo">Métrica de acuracidade</h2>
          <div className="flex gap-3">
            {(Object.keys(METRIC_LABELS) as Array<keyof typeof METRIC_LABELS>).map((m) => (
              <label key={m} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-4 py-2 transition ${accuracyMetric === m ? 'border-petroleo bg-fundo-principal font-semibold text-petroleo' : 'border-cinza text-texto-principal hover:border-petroleo/50'}`}>
                <input type="radio" name="accuracyMetric" value={m} checked={accuracyMetric === m} onChange={() => setAccuracyMetric(m)} className="hidden" />
                {METRIC_LABELS[m]}
              </label>
            ))}
          </div>
        </section>

        {/* Horizonte e meses de rateio */}
        <section className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-titulo">Horizonte de previsão (meses)</label>
            <input
              type="number"
              min={1}
              max={120}
              value={horizonMonths}
              onChange={(e) => setHorizonMonths(Number(e.target.value))}
              className="w-full rounded border border-cinza bg-fundo-principal px-3 py-2 text-texto-principal outline-none focus:border-petroleo"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-titulo">Meses de rateio</label>
            <input
              type="number"
              min={1}
              max={24}
              value={prorationMonths}
              onChange={(e) => setProrationMonths(Number(e.target.value))}
              className="w-full rounded border border-cinza bg-fundo-principal px-3 py-2 text-texto-principal outline-none focus:border-petroleo"
            />
          </div>
        </section>

        {warnings.map((w) => (
          <p key={w} className="text-sm text-amber-600">{w}</p>
        ))}
        {saveError && <p className="text-sm text-red-600">{saveError}</p>}

        <button
          type="submit"
          disabled={saving || selected.length === 0}
          className="w-full rounded bg-petroleo py-3 font-semibold text-branco transition hover:opacity-90 disabled:opacity-50"
        >
          {saving ? 'Salvando e disparando cálculo…' : 'Salvar e calcular previsão →'}
        </button>
      </form>
    </div>
  );
}
