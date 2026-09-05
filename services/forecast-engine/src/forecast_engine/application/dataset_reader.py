"""
Leitura do dataset Parquet com colunas numéricas em string decimal (D5, T078).

O dataset viaja no MinIO como referência s3://bucket/key (D5 — nunca o dado
em si na mensagem). Este leitor baixa o Parquet, decodifica as colunas de
quantidade como string decimal e produz HistoryRow.

Colunas esperadas no Parquet (vão do worker de ingestão com esses nomes):
  - product_code: str
  - segments: list[str] serializado como JSON string OU como coluna struct
  - year: int
  - month: int
  - quantity: str (decimal string — Princípio V)
"""

from __future__ import annotations

import json
from io import BytesIO
from typing import Iterator

import pyarrow.parquet as pq

from forecast_engine.adapters.object_store import ObjectStore
from forecast_engine.domain.aggregation import HistoryRow


class DatasetReader:
    """Lê um dataset Parquet do MinIO e produz HistoryRow."""

    def __init__(self, store: ObjectStore) -> None:
        self._store = store

    def read(self, uri: str) -> list[HistoryRow]:
        """Baixa o Parquet e devolve as linhas como HistoryRow.

        Todas as colunas numéricas chegam como string decimal — nunca como
        float. Qualquer conversão de tipo aqui viola o Princípio V.
        """
        data = self._store.get_bytes(uri)
        table = pq.read_table(BytesIO(data))

        rows: list[HistoryRow] = []
        for batch in table.to_batches():
            d = batch.to_pydict()
            n = len(d.get("product_code", []))
            for i in range(n):
                segments_raw = d["segments"][i]
                if isinstance(segments_raw, str):
                    segments = tuple(json.loads(segments_raw))
                elif isinstance(segments_raw, (list, tuple)):
                    segments = tuple(str(s) for s in segments_raw)
                else:
                    segments = ()

                rows.append(
                    HistoryRow(
                        product_code=str(d["product_code"][i]),
                        segments=segments,
                        year=int(d["year"][i]),
                        month=int(d["month"][i]),
                        quantity=str(d["quantity"][i]),
                    )
                )
        return rows
