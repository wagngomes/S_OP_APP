'use client';

/**
 * PhaseContext — indicador de fase e ação esperada (FR-016, FR-097).
 *
 * Exibe a fase atual do cenário com uma descrição do que o usuário deve fazer
 * e uma barra de progresso das fases disponíveis.
 *
 * Ações bloqueadas na fase atual ficam visivelmente desabilitadas via opacity
 * para comunicar FR-016 sem precisar de código de negócio neste componente.
 */

type Phase =
  | 'TEAM_SETUP'
  | 'IMPORT_SETUP'
  | 'CALCULATION'
  | 'APPROVAL'
  | 'COLLABORATION'
  | 'CONSENSUS'
  | 'PUBLICATION'
  | 'ACCURACY';

type PhaseInfo = {
  label: string;
  description: string;
  expected: string;
  badgeClass: string;
};

const PHASES: Phase[] = [
  'TEAM_SETUP',
  'IMPORT_SETUP',
  'CALCULATION',
  'APPROVAL',
  'COLLABORATION',
  'CONSENSUS',
  'PUBLICATION',
  'ACCURACY',
];

const PHASE_INFO: Record<Phase, PhaseInfo> = {
  TEAM_SETUP: {
    label: 'Montagem de equipe',
    description: 'Defina quem participará deste ciclo de S&OP.',
    expected: 'Convide aprovadores e colaboradores, depois feche a equipe.',
    badgeClass: 'bg-fundo-secundario text-texto-principal',
  },
  IMPORT_SETUP: {
    label: 'Importação e parametrização',
    description: 'Importe o histórico de vendas e configure o modelo de previsão.',
    expected: 'Faça o upload do CSV de histórico e ajuste os parâmetros do modelo.',
    badgeClass: 'bg-fundo-secundario text-texto-principal',
  },
  CALCULATION: {
    label: 'Cálculo em andamento',
    description: 'O motor de previsão está processando os dados.',
    expected: 'Aguarde o cálculo. Você será notificado quando terminar.',
    badgeClass: 'bg-turquesa/20 text-petroleo',
  },
  APPROVAL: {
    label: 'Aguardando aprovação',
    description: 'A previsão está pronta e aguarda revisão dos aprovadores.',
    expected: 'Revise os resultados e aprove ou devolva a previsão para reparametrização.',
    badgeClass: 'bg-yellow-100 text-yellow-800',
  },
  COLLABORATION: {
    label: 'Colaboração',
    description: 'Colaboradores podem ajustar itens da previsão.',
    expected: 'Revise e ajuste os itens que precisam de correção.',
    badgeClass: 'bg-blue-100 text-blue-800',
  },
  CONSENSUS: {
    label: 'Consenso',
    description: 'Defina o valor final de cada item — calculado, colaborado ou manual.',
    expected: 'Decida cada item e publique quando todos estiverem decididos.',
    badgeClass: 'bg-purple-100 text-purple-800',
  },
  PUBLICATION: {
    label: 'Publicado',
    description: 'A previsão foi publicada e está disponível para consulta.',
    expected: 'Consulte a previsão publicada. Esta fase é somente leitura.',
    badgeClass: 'bg-verde/10 text-verde',
  },
  ACCURACY: {
    label: 'Acurácia',
    description: 'A previsão está sendo comparada com as vendas reais.',
    expected: 'Acompanhe a acurácia do modelo quando os dados reais chegarem.',
    badgeClass: 'bg-verde/10 text-verde',
  },
};

type Props = {
  phase: Phase | string;
  className?: string;
};

export function PhaseContext({ phase, className = '' }: Props) {
  const info = PHASE_INFO[phase as Phase];
  if (!info) return null;

  const currentIndex = PHASES.indexOf(phase as Phase);

  return (
    <div className={`rounded-lg border border-cinza bg-fundo-secundario p-4 ${className}`}>
      <div className="mb-3 flex items-center gap-3">
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${info.badgeClass}`}>
          {info.label}
        </span>
        <p className="text-sm text-texto-principal/70">{info.description}</p>
      </div>

      <div className="mb-4 rounded bg-fundo-principal px-3 py-2 text-sm">
        <span className="mr-1 font-medium text-petroleo">O que fazer agora:</span>
        <span className="text-texto-principal">{info.expected}</span>
      </div>

      {/* Barra de progresso de fases */}
      <div className="flex items-center gap-1 overflow-x-auto">
        {PHASES.slice(0, -1).map((p, i) => {
          const isPast = i < currentIndex;
          const isCurrent = i === currentIndex;
          const isFuture = i > currentIndex;

          return (
            <div key={p} className="flex items-center gap-1">
              <div
                title={PHASE_INFO[p]?.label ?? p}
                className={`h-2 w-2 rounded-full transition-all ${
                  isPast
                    ? 'bg-verde'
                    : isCurrent
                      ? 'h-3 w-3 bg-petroleo ring-2 ring-petroleo/30'
                      : 'bg-cinza'
                } ${isFuture ? 'opacity-40' : ''}`}
              />
              {i < PHASES.length - 2 && (
                <div
                  className={`h-px w-4 ${isPast ? 'bg-verde' : 'bg-cinza'}`}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
