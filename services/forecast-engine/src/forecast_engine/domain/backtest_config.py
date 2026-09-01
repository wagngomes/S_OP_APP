"""Configuração do backtest (D14, FR-043e).

Esta configuração **determina qual modelo vence cada série**: dois valores de
janela produzem dois vencedores diferentes para os mesmos dados. Não é detalhe de
tuning — é parte do contrato do resultado, e por isso é versionada junto com o
catálogo em `CATALOG_VERSION`.

Escolhas e o porquê:

- **horizonte de avaliação = 3 meses**, e não os 12 do horizonte publicado. É o
  horizonte que o consenso de S&OP realmente discute — os meses próximos, onde a
  decisão de suprimento é tomada. Avaliar em 12 alinharia melhor a régua ao que se
  publica, mas com 3 janelas exigiria 36 meses só de teste, e quase toda série real
  seria descartada por falta de histórico.
- **janelas não sobrepostas** (passo = horizonte). Sobrepor daria mais pontos de
  avaliação ao custo de multiplicar o número de ajustes, sem ganho claro na
  seleção.
- **mínimo de treino por MODELO, não por pacote**. As séries de um mesmo cenário
  têm comprimentos muito diferentes; travar por pacote descartaria modelos viáveis
  em séries longas ou admitiria modelos inviáveis em séries curtas.
"""

from __future__ import annotations

from dataclasses import dataclass

from forecast_engine.domain.model_catalog import ModelPackage, models_of_package

BACKTEST_HORIZON = 3
"""Meses avaliados em cada janela."""

_WINDOWS_BY_PACKAGE: dict[ModelPackage, int] = {
    "FAST": 1,
    "STANDARD": 3,
    "COMPLETE": 4,
}

MODEL_MIN_TRAINING_MONTHS: dict[str, int] = {
    # Sem estrutura a estimar além do nível.
    "Naive": 6,
    "HistoricAverage": 6,
    "WindowAverage": 6,
    # Precisam de tendência e de algum sinal para estimar parâmetros.
    "AutoETS": 12,
    "AutoTheta": 12,
    "CrostonOptimized": 12,
    # Componente sazonal m=12: sem um ciclo inteiro no treino, não há o que estimar.
    "SeasonalNaive": 24,
    "AutoARIMA": 24,
}

# Último recurso quando a série não sustenta nenhum outro candidato (FR-043b).
FALLBACK_MODEL = "Naive"


@dataclass(frozen=True, slots=True)
class BacktestConfig:
    windows: int
    horizon: int
    step: int

    @property
    def test_months(self) -> int:
        """Meses consumidos pela avaliação, fora o treino."""
        return (self.windows - 1) * self.step + self.horizon


def backtest_config(package: ModelPackage) -> BacktestConfig:
    windows = _WINDOWS_BY_PACKAGE.get(package)
    if windows is None:
        raise ValueError(f"pacote desconhecido: {package!r}")
    return BacktestConfig(windows=windows, horizon=BACKTEST_HORIZON, step=BACKTEST_HORIZON)


def feasible_models(
    package: ModelPackage,
    history_months: int,
) -> tuple[list[str], dict[str, str]]:
    """Modelos aplicáveis a uma série, e o motivo de cada exclusão.

    FR-043b: a série nunca fica sem candidato. Se nada couber, sobra o
    `FALLBACK_MODEL`, e o resultado registra `fallbackApplied`.
    """
    cfg = backtest_config(package)
    # O treino é o que sobra depois de reservar os meses de avaliação.
    training_months = history_months - cfg.test_months

    viable: list[str] = []
    excluded: dict[str, str] = {}

    for model in models_of_package(package):
        required = MODEL_MIN_TRAINING_MONTHS[model]
        if training_months >= required:
            viable.append(model)
        else:
            excluded[model] = (
                f"histórico insuficiente: {model} exige {required} meses de treino, "
                f"a série oferece {max(training_months, 0)}"
            )

    if not viable:
        viable = [FALLBACK_MODEL]
        excluded.pop(FALLBACK_MODEL, None)

    return viable, excluded


def usable_windows(package: ModelPackage, history_months: int) -> int:
    """Janelas efetivamente utilizáveis numa série.

    D14: série curta demais para a profundidade do pacote **cai para a maior
    configuração viável** em vez de ficar de fora do resultado. O valor entra em
    `backtestWindowsUsed`, para que o usuário saiba que aquele item foi avaliado
    com menos evidência.
    """
    cfg = backtest_config(package)
    minimum_training = min(MODEL_MIN_TRAINING_MONTHS.values())

    for windows in range(cfg.windows, 0, -1):
        test_months = (windows - 1) * cfg.step + cfg.horizon
        if history_months - test_months >= minimum_training:
            return windows

    return 0
