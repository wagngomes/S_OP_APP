"""Processamento em lotes para respeitar o limite de memória (T092).

Por padrão, statsforecast com modelos complexos pode usar ~1 MB de RAM por série
no backtest. Com BATCH_SIZE=500 o pico por lote é ~500 MB — dentro do mem_limit
de 1024 MB configurado no docker-compose.yml.

Quando o dataset cabe em um único lote o overhead é zero: run_forecast é chamado
diretamente, sem criar grupos extras.
"""

from __future__ import annotations

import logging
from collections.abc import Sequence

from forecast_engine.application.forecast_job import ForecastParams, JobOutcome, run_forecast
from forecast_engine.domain.aggregation import HistoryRow

_logger = logging.getLogger(__name__)

DEFAULT_BATCH_SIZE = 500


def _series_key(row: HistoryRow, positions: Sequence[int]) -> tuple[str, ...]:
    return tuple(row.segments[i] for i in positions if i < len(row.segments))


def run_forecast_in_batches(
    rows: list[HistoryRow],
    params: ForecastParams,
    batch_size: int = DEFAULT_BATCH_SIZE,
) -> JobOutcome:
    """Executa run_forecast em lotes de `batch_size` séries agregadas.

    Cada lote é isolado — as linhas de um lote não incluem séries de outro —
    de modo que a conservação de soma e a representatividade são preservadas
    dentro de cada lote sem interferência dos outros.
    """
    if not rows:
        raise ValueError("histórico vazio: não há o que calcular")

    series_map: dict[tuple[str, ...], list[HistoryRow]] = {}
    for row in rows:
        key = _series_key(row, params.grouping_positions)
        series_map.setdefault(key, []).append(row)

    keys = list(series_map)
    total = len(keys)

    if total <= batch_size:
        return run_forecast(rows, params)

    batches = (total + batch_size - 1) // batch_size
    all_series = []
    all_items = []

    for batch_idx in range(batches):
        start = batch_idx * batch_size
        end = min(start + batch_size, total)
        batch_keys = keys[start:end]
        batch_rows = [row for key in batch_keys for row in series_map[key]]

        _logger.info(
            "lote %d/%d — %d séries",
            batch_idx + 1,
            batches,
            len(batch_keys),
        )

        outcome = run_forecast(batch_rows, params)
        all_series.extend(outcome.series)
        all_items.extend(outcome.items)

    return JobOutcome(series=all_series, items=all_items)
