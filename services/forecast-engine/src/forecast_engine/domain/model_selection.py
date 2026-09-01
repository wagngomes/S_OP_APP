"""Backtest e seleção do melhor modelo por série (FR-041, FR-042, FR-043a-b).

Esta é a fronteira do float declarada em D2: a entrada chega em `Decimal`, a
modelagem roda em `float64` porque não existe caminho realista para ajustar
ARIMA/ETS em aritmética decimal, e a **saída volta quantizada** para a escala do
sistema antes de qualquer serialização.

Nada aqui escreve log nem toca infraestrutura: é domínio, e precisa continuar
executável em teste sem nenhuma dependência de fora (Princípio I).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal
from typing import Sequence

import numpy as np
import pandas as pd
from statsforecast import StatsForecast
from statsforecast.models import (
    AutoARIMA,
    AutoETS,
    AutoTheta,
    CrostonOptimized,
    HistoricAverage,
    Naive,
    SeasonalNaive,
    WindowAverage,
)

from forecast_engine.domain.backtest_config import (
    FALLBACK_MODEL,
    backtest_config,
    feasible_models,
    usable_windows,
)
from forecast_engine.domain.decimal_codec import DECIMAL_SCALE, quantize
from forecast_engine.domain.metrics import compute_metric, selection_value
from forecast_engine.domain.model_catalog import ModelPackage

Period = tuple[int, int]
SeriesPoints = Sequence[tuple[Period, Decimal]]

SEASON_LENGTH = 12
"""Sazonalidade anual: a granularidade do sistema é mensal."""

WINDOW_AVERAGE_SIZE = 3


@dataclass(frozen=True, slots=True)
class SelectionResult:
    winning_model: str
    metric_name: str
    metric_value: Decimal | None
    forecast: list[Decimal]
    evaluated: dict[str, Decimal | None]
    excluded_models: dict[str, str] = field(default_factory=dict)
    fallback_applied: bool = False
    backtest_windows_used: int = 0


def _build(name: str):
    """Instancia um modelo do catálogo."""
    if name == "Naive":
        return Naive()
    if name == "SeasonalNaive":
        return SeasonalNaive(season_length=SEASON_LENGTH)
    if name == "HistoricAverage":
        return HistoricAverage()
    if name == "WindowAverage":
        return WindowAverage(window_size=WINDOW_AVERAGE_SIZE)
    if name == "AutoETS":
        return AutoETS(season_length=SEASON_LENGTH)
    if name == "AutoTheta":
        return AutoTheta(season_length=SEASON_LENGTH)
    if name == "CrostonOptimized":
        return CrostonOptimized()
    if name == "AutoARIMA":
        return AutoARIMA(season_length=SEASON_LENGTH)
    raise ValueError(f"modelo fora do catálogo: {name!r}")


def _to_frame(points: SeriesPoints) -> pd.DataFrame:
    """Converte a série para o formato do StatsForecast.

    Aqui está a conversão `Decimal → float64` da fronteira D2. É a única direção
    em que ela acontece sem quantização: entrando na modelagem.
    """
    return pd.DataFrame(
        {
            "unique_id": "s",
            "ds": pd.to_datetime([f"{y:04d}-{m:02d}-01" for (y, m), _ in points]),
            "y": np.array([float(v) for _, v in points], dtype="float64"),
        }
    )


def select_model(
    points: SeriesPoints,
    package: ModelPackage,
    metric: str,
    horizon: int,
    scale: int = DECIMAL_SCALE,
) -> SelectionResult:
    """Avalia os candidatos por backtest e devolve o vencedor com sua previsão.

    O vencedor é o de menor erro na métrica que o usuário escolheu antes do
    cálculo (FR-042). Para o viés, compara-se o MÓDULO: o objetivo é ausência de
    tendência, não a tendência mais negativa.
    """
    if not points:
        raise ValueError("série vazia: não há o que modelar")
    if horizon < 1:
        raise ValueError(f"horizonte inválido: {horizon}")

    history_months = len(points)
    viable, excluded = feasible_models(package, history_months)
    windows = usable_windows(package, history_months)
    fallback_applied = viable == [FALLBACK_MODEL] and len(excluded) > 0

    # Modelos multiplicativos não lidam com valores não positivos (D16).
    if any(v <= 0 for _, v in points):
        for name in ("AutoETS", "AutoTheta", "CrostonOptimized"):
            if name in viable:
                viable.remove(name)
                excluded[name] = "série contém valores não positivos"
        if not viable:
            viable = [FALLBACK_MODEL]
            fallback_applied = True

    frame = _to_frame(points)
    cfg = backtest_config(package)
    evaluated: dict[str, Decimal | None] = {}

    if windows >= 1 and len(viable) > 1:
        evaluated = _backtest(frame, viable, metric, cfg.horizon, windows, cfg.step, scale)
        winner = _pick_winner(evaluated, metric, viable)
    else:
        # Sem evidência suficiente para comparar: não se inventa uma competição.
        winner = viable[0]
        evaluated = {winner: None}
        windows = 0

    forecast = _forecast(frame, winner, horizon, scale)

    return SelectionResult(
        winning_model=winner,
        metric_name=metric,
        metric_value=evaluated.get(winner),
        forecast=forecast,
        evaluated=evaluated,
        excluded_models=excluded,
        fallback_applied=fallback_applied,
        backtest_windows_used=windows,
    )


def _backtest(
    frame: pd.DataFrame,
    models: list[str],
    metric: str,
    horizon: int,
    windows: int,
    step: int,
    scale: int,
) -> dict[str, Decimal | None]:
    """Erro de cada candidato por validação cruzada com janelas deslizantes."""
    sf = StatsForecast(models=[_build(m) for m in models], freq="MS", n_jobs=1)
    cv = sf.cross_validation(df=frame, h=horizon, n_windows=windows, step_size=step)

    actual = [Decimal(quantize(v, scale)) for v in cv["y"].tolist()]
    scores: dict[str, Decimal | None] = {}

    for name in models:
        column = _column_of(cv, name)
        if column is None:
            scores[name] = None
            continue
        predicted = [Decimal(quantize(v, scale)) for v in cv[column].tolist()]
        scores[name] = compute_metric(metric, actual, predicted, scale)

    return scores


def _column_of(cv: pd.DataFrame, model: str) -> str | None:
    """O StatsForecast nomeia a coluna pelo alias do modelo, que pode variar."""
    if model in cv.columns:
        return model
    for column in cv.columns:
        if str(column).startswith(model):
            return str(column)
    return None


def _pick_winner(
    scores: dict[str, Decimal | None],
    metric: str,
    order: Sequence[str],
) -> str:
    """Menor erro vence; empate resolvido pela ordem do catálogo (FR-087)."""
    ranked = [(name, value) for name, value in scores.items() if value is not None]
    if not ranked:
        return order[0]
    return min(ranked, key=lambda kv: (selection_value(metric, kv[1]), order.index(kv[0])))[0]


def _forecast(frame: pd.DataFrame, model: str, horizon: int, scale: int) -> list[Decimal]:
    """Previsão do vencedor, quantizada de volta para decimal.

    Esta é a saída da fronteira D2: nada sai daqui em ponto flutuante.
    """
    sf = StatsForecast(models=[_build(model)], freq="MS", n_jobs=1)
    result = sf.forecast(df=frame, h=horizon)
    column = _column_of(result, model)
    if column is None:  # pragma: no cover - defensivo
        raise ValueError(f"o modelo {model} não devolveu previsão")
    return [Decimal(quantize(v, scale)) for v in result[column].tolist()]
