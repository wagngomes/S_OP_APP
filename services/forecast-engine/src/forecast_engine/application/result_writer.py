"""
Escrita de output.parquet, series.parquet e do marcador _SUCCESS (D18, T090).

O marcador _SUCCESS é escrito POR ÚLTIMO, depois que ambos os Parquets estão
no MinIO. A idempotência (D6) verifica só o marcador — se ele existe, o
resultado está completo. Escrever o marcador antes dos Parquets cria uma janela
onde o consumidor pode ler um resultado pela metade.

Colunas de output.parquet (ForecastItem → linha de resultado granular):
  product_code, seg_0 .. seg_N, year, month, quantity (string decimal)

Colunas de series.parquet (SeriesOutcome → metadados de modelagem):
  series_key, winning_model, metric_name, metric_value, fallback_applied,
  backtest_windows_used, evaluated (JSON), excluded_models (JSON)
"""

from __future__ import annotations

import json
from io import BytesIO

import pyarrow as pa
import pyarrow.parquet as pq

from forecast_engine.adapters.object_store import ObjectStore
from forecast_engine.application.forecast_job import ItemForecast, JobOutcome, SeriesOutcome


def _items_to_table(items: list[ItemForecast]) -> pa.Table:
    if not items:
        schema = pa.schema([
            ("product_code", pa.string()),
            ("year", pa.int32()),
            ("month", pa.int32()),
            ("quantity", pa.string()),
        ])
        return pa.table({}, schema=schema)

    max_segs = max(len(item.segments) for item in items)
    data: dict[str, list] = {
        "product_code": [],
        **{f"seg_{i}": [] for i in range(max_segs)},
        "year": [],
        "month": [],
        "quantity": [],
    }
    for item in items:
        data["product_code"].append(item.product_code)
        for i in range(max_segs):
            data[f"seg_{i}"].append(item.segments[i] if i < len(item.segments) else "")
        data["year"].append(item.year)
        data["month"].append(item.month)
        data["quantity"].append(item.quantity)

    return pa.table(data)


def _series_to_table(series: list[SeriesOutcome]) -> pa.Table:
    data: dict[str, list] = {
        "series_key": [],
        "winning_model": [],
        "metric_name": [],
        "metric_value": [],
        "fallback_applied": [],
        "backtest_windows_used": [],
        "evaluated": [],
        "excluded_models": [],
    }
    for s in series:
        data["series_key"].append(json.dumps(list(s.series_key)))
        data["winning_model"].append(s.winning_model)
        data["metric_name"].append(s.metric_name)
        data["metric_value"].append(str(s.metric_value) if s.metric_value is not None else None)
        data["fallback_applied"].append(s.fallback_applied)
        data["backtest_windows_used"].append(s.backtest_windows_used)
        data["evaluated"].append(json.dumps(
            {k: str(v) if v is not None else None for k, v in s.evaluated.items()}
        ))
        data["excluded_models"].append(json.dumps(s.excluded_models))

    return pa.table(data)


class ResultWriter:
    """Grava o resultado do job no MinIO como Parquet + marcador _SUCCESS."""

    def __init__(self, store: ObjectStore) -> None:
        self._store = store

    def write(self, output_prefix: str, outcome: JobOutcome) -> None:
        """Persiste os dois Parquets. Não grava _SUCCESS — isso é do consumidor."""
        sep = "" if output_prefix.endswith("/") else "/"

        # output.parquet — previsão por item (granularidade original)
        items_buf = BytesIO()
        pq.write_table(_items_to_table(outcome.items), items_buf)
        self._store.put_bytes(f"{output_prefix}{sep}output.parquet", items_buf.getvalue())

        # series.parquet — metadados de modelagem por série agregada
        series_buf = BytesIO()
        pq.write_table(_series_to_table(outcome.series), series_buf)
        self._store.put_bytes(f"{output_prefix}{sep}series.parquet", series_buf.getvalue())
