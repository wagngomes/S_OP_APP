"""Orquestração do job de previsão (T089, T092).

Camada de aplicação: coordena o domínio, sem conter regra de negócio própria
(Princípio I). A ordem das operações é a de D16, e não é negociável:

    agregar → preparar série → prever → PISO ZERO → ratear → quantizar

Não conhece MinIO, RabbitMQ nem banco. Recebe as linhas e devolve o resultado;
quem lê e grava são os adaptadores. É isso que permite testar o cálculo inteiro
sem infraestrutura.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal
from typing import Iterable, Sequence

from forecast_engine.domain.aggregation import (
    ItemKey,
    Period,
    SeriesKey,
    aggregate_series,
    items_of_series,
    representativeness,
)
from forecast_engine.domain.decimal_codec import DECIMAL_SCALE
from forecast_engine.domain.model_catalog import ModelPackage
from forecast_engine.domain.model_selection import select_model
from forecast_engine.domain.proration import prorate
from forecast_engine.domain.series_preparation import next_periods, prepare_series
from forecast_engine.domain.zero_floor import apply_zero_floor

from forecast_engine.domain.aggregation import HistoryRow


@dataclass(frozen=True, slots=True)
class ForecastParams:
    """Parametrização congelada no disparo do job (FR-104)."""

    grouping_positions: Sequence[int]
    proration_months: int
    horizon_months: int
    metric: str
    package: ModelPackage
    scale: int = DECIMAL_SCALE


@dataclass(frozen=True, slots=True)
class SeriesOutcome:
    """Resultado por série agregada — vira ForecastSeriesResult na API."""

    series_key: SeriesKey
    winning_model: str
    metric_name: str
    metric_value: Decimal | None
    evaluated: dict[str, Decimal | None]
    excluded_models: dict[str, str]
    fallback_applied: bool
    backtest_windows_used: int
    forecast_by_period: dict[Period, Decimal]


@dataclass(frozen=True, slots=True)
class ItemForecast:
    """Previsão na granularidade original — vira ForecastItem na API."""

    series_key: SeriesKey
    product_code: str
    segments: tuple[str, ...]
    year: int
    month: int
    quantity: str
    """String decimal — nada sai do motor em ponto flutuante (Princípio V)."""


@dataclass(frozen=True, slots=True)
class JobOutcome:
    series: list[SeriesOutcome] = field(default_factory=list)
    items: list[ItemForecast] = field(default_factory=list)

    @property
    def series_count(self) -> int:
        return len(self.series)


def run_forecast(rows: Iterable[HistoryRow], params: ForecastParams) -> JobOutcome:
    """Executa o cálculo completo de um cenário."""
    materialized = list(rows)
    if not materialized:
        raise ValueError("histórico vazio: não há o que calcular")

    aggregated = aggregate_series(materialized, params.grouping_positions)
    if not aggregated:
        raise ValueError("nenhuma série produzida pela combinação de níveis escolhida")

    horizon_periods = _horizon_periods(aggregated, params.horizon_months)
    proration_window = _proration_window(materialized, params.proration_months)

    weights_by_series = representativeness(
        materialized, params.grouping_positions, proration_window
    )
    items_by_series = items_of_series(materialized, params.grouping_positions)

    series_out: list[SeriesOutcome] = []
    items_out: list[ItemForecast] = []

    for series_key, points in aggregated.items():
        prepared = prepare_series(points)
        if not prepared:
            # Série inteiramente zerada: previsão zero, sem inventar modelagem.
            forecast = [Decimal(0)] * len(horizon_periods)
            outcome = _empty_outcome(series_key, params, horizon_periods, forecast)
        else:
            selection = select_model(
                prepared,
                package=params.package,
                metric=params.metric,
                horizon=len(horizon_periods),
                scale=params.scale,
            )
            # Piso zero na SÉRIE, antes do rateio (D16, FR-040b).
            forecast = apply_zero_floor(selection.forecast)
            outcome = SeriesOutcome(
                series_key=series_key,
                winning_model=selection.winning_model,
                metric_name=selection.metric_name,
                metric_value=selection.metric_value,
                evaluated=selection.evaluated,
                excluded_models=selection.excluded_models,
                fallback_applied=selection.fallback_applied,
                backtest_windows_used=selection.backtest_windows_used,
                forecast_by_period=dict(zip(horizon_periods, forecast)),
            )

        series_out.append(outcome)
        items_out.extend(
            _prorate_series(
                series_key=series_key,
                horizon_periods=horizon_periods,
                forecast=forecast,
                items=items_by_series.get(series_key, []),
                weights=weights_by_series.get(series_key, {}),
                scale=params.scale,
            )
        )

    return JobOutcome(series=series_out, items=items_out)


def _horizon_periods(
    aggregated: dict[SeriesKey, dict[Period, Decimal]],
    horizon_months: int,
) -> list[Period]:
    """Meses previstos: os seguintes ao último mês do histórico (FR-040)."""
    last = max(period for points in aggregated.values() for period in points)
    return next_periods(last, horizon_months)


def _proration_window(rows: Sequence[HistoryRow], months: int) -> list[Period]:
    """Os `months` meses mais recentes do histórico (FR-045)."""
    periods = sorted({(r.year, r.month) for r in rows})
    return periods[-months:] if months > 0 else []


def _prorate_series(
    series_key: SeriesKey,
    horizon_periods: Sequence[Period],
    forecast: Sequence[Decimal],
    items: Sequence[ItemKey],
    weights: dict[ItemKey, Decimal],
    scale: int,
) -> list[ItemForecast]:
    """Distribui a previsão da série entre seus itens, mês a mês.

    Todos os itens da série entram, inclusive os sem movimento na janela de
    rateio: eles recebem zero, mas não desaparecem do resultado (FR-047).
    """
    if not items:
        return []

    ordered_weights = [weights.get(item, Decimal(0)) for item in items]
    out: list[ItemForecast] = []

    for period, parent in zip(horizon_periods, forecast):
        shares = prorate(parent, ordered_weights, scale)
        for item, share in zip(items, shares):
            product_code, segments = item
            out.append(
                ItemForecast(
                    series_key=series_key,
                    product_code=product_code,
                    segments=segments,
                    year=period[0],
                    month=period[1],
                    quantity=share,
                )
            )

    return out


def _empty_outcome(
    series_key: SeriesKey,
    params: ForecastParams,
    horizon_periods: Sequence[Period],
    forecast: Sequence[Decimal],
) -> SeriesOutcome:
    return SeriesOutcome(
        series_key=series_key,
        winning_model="Naive",
        metric_name=params.metric,
        metric_value=None,
        evaluated={},
        excluded_models={"*": "série sem movimento no histórico"},
        fallback_applied=True,
        backtest_windows_used=0,
        forecast_by_period=dict(zip(horizon_periods, forecast)),
    )
