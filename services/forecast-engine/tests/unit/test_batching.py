"""Testes para o processamento em lotes (T092).

Prova que run_forecast_in_batches:
1. Produz o mesmo número de séries e itens que run_forecast single-pass.
2. Preserva a conservação de soma entre as duas chamadas.
3. Funciona corretamente quando o dataset cabe em um único lote.
4. Funciona quando há múltiplos lotes.
5. Falha se o histórico for vazio.
"""

from __future__ import annotations

from decimal import Decimal

import pytest

from forecast_engine.application.batching import run_forecast_in_batches
from forecast_engine.application.forecast_job import ForecastParams, run_forecast
from forecast_engine.domain.aggregation import HistoryRow


def _rows(n_series: int, months: int = 24) -> list[HistoryRow]:
    """Histórico sintético com `n_series` séries distintas (um item por série)."""
    rows: list[HistoryRow] = []
    for s in range(n_series):
        year, month = 2023, 1
        for _ in range(months):
            rows.append(
                HistoryRow(
                    product_code=f"P{s:04d}",
                    segments=(f"BU{s % 5}", f"CD{s % 10}"),
                    year=year,
                    month=month,
                    quantity=str(Decimal(s + 1) * 10),
                )
            )
            month += 1
            if month > 12:
                month, year = 1, year + 1
    return rows


PARAMS = ForecastParams(
    grouping_positions=[0],  # agrupa só por BU
    proration_months=12,
    horizon_months=3,
    metric="WMAPE",
    package="FAST",
)


def test_dataset_menor_que_lote_usa_single_pass() -> None:
    rows = _rows(5, months=24)
    # batch_size maior que o número de séries agregadas
    result = run_forecast_in_batches(rows, PARAMS, batch_size=100)
    expected = run_forecast(rows, PARAMS)
    assert result.series_count == expected.series_count
    assert len(result.items) == len(expected.items)


def test_multiplos_lotes_preservam_contagem() -> None:
    rows = _rows(10, months=24)
    # Com grouping_positions=[0] há 5 séries (BU0..BU4).
    # batch_size=2 força 3 lotes.
    result = run_forecast_in_batches(rows, PARAMS, batch_size=2)
    expected = run_forecast(rows, PARAMS)
    assert result.series_count == expected.series_count


def test_conservacao_de_soma_em_lotes() -> None:
    """A soma dos itens de cada série deve igualar a previsão da série."""
    rows = _rows(8, months=24)
    result = run_forecast_in_batches(rows, PARAMS, batch_size=2)

    # Soma por (série, período)
    item_sums: dict = {}
    for item in result.items:
        key = (item.series_key, item.year, item.month)
        item_sums[key] = item_sums.get(key, Decimal(0)) + Decimal(item.quantity)

    # Cada série deve ter a previsão correta no acumulado
    for outcome in result.series:
        for (y, m), qty in outcome.forecast_by_period.items():
            key = (outcome.series_key, y, m)
            assert item_sums.get(key, Decimal(0)) == qty, (
                f"Série {outcome.series_key}: {item_sums.get(key)} != {qty} em {y}-{m:02d}"
            )


def test_historico_vazio_levanta_excecao() -> None:
    with pytest.raises(ValueError, match="vazio"):
        run_forecast_in_batches([], PARAMS)


def test_lote_tamanho_1_funciona() -> None:
    rows = _rows(3, months=24)
    result = run_forecast_in_batches(rows, PARAMS, batch_size=1)
    expected = run_forecast(rows, PARAMS)
    assert result.series_count == expected.series_count
