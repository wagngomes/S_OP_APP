"""Agregação do histórico até a combinação de níveis escolhida (FR-039).

Aritmética decimal, não `float64`. Somar quantidades em ponto flutuante aqui
plantaria o erro na base de todo o cálculo posterior — e o Princípio V proíbe
exatamente isso para grandeza de estoque. O float só entra depois, na modelagem,
onde é inevitável e onde a fronteira está declarada (D2).

Por isso este módulo é Python puro: sem pandas, sem numpy. Também é o que o torna
testável sem nenhuma dependência.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Iterable, Sequence

Period = tuple[int, int]
"""(ano, mês) — a granularidade temporal do sistema é mensal."""

SeriesKey = tuple[str, ...]
"""Valores dos níveis que definem a série agregada."""

ItemKey = tuple[str, tuple[str, ...]]
"""(código do produto, segmentos) — a granularidade original do arquivo."""


@dataclass(frozen=True, slots=True)
class HistoryRow:
    """Linha do histórico, como sai da ingestão."""

    product_code: str
    segments: tuple[str, ...]
    year: int
    month: int
    quantity: str
    """String decimal — nunca `float` (Princípio V)."""


def series_key(row: HistoryRow, grouping_positions: Sequence[int]) -> SeriesKey:
    """Chave da série a que a linha pertence.

    As posições são ORDENADAS antes de montar a chave: arrastar Setor antes de BU
    não pode produzir uma série diferente de arrastar BU antes de Setor. A
    hierarquia é a do layout declarado na importação, não a da ordem em que o
    usuário mexeu no campo.
    """
    return tuple(row.segments[p] for p in sorted(grouping_positions))


def item_key(row: HistoryRow) -> ItemKey:
    """Chave do item na granularidade original — o destino do rateio."""
    return (row.product_code, row.segments)


def aggregate_series(
    rows: Iterable[HistoryRow],
    grouping_positions: Sequence[int],
) -> dict[SeriesKey, dict[Period, Decimal]]:
    """Soma o histórico por série e por período.

    Com `grouping_positions` vazio, tudo cai numa única série — a visão Cia.
    """
    result: dict[SeriesKey, dict[Period, Decimal]] = {}

    for row in rows:
        key = series_key(row, grouping_positions)
        period: Period = (row.year, row.month)
        by_period = result.setdefault(key, {})
        by_period[period] = by_period.get(period, Decimal(0)) + Decimal(row.quantity)

    return result


def representativeness(
    rows: Iterable[HistoryRow],
    grouping_positions: Sequence[int],
    months: Sequence[Period],
) -> dict[SeriesKey, dict[ItemKey, Decimal]]:
    """Peso de cada item dentro da sua série, no período de rateio (FR-045).

    Considera apenas os meses informados: é o "quantos meses de histórico" que o
    usuário escolheu na parametrização. Item sem movimento no período fica com
    peso zero, e o tratamento disso é do rateio (FR-047), não daqui.
    """
    window = set(months)
    result: dict[SeriesKey, dict[ItemKey, Decimal]] = {}

    for row in rows:
        if (row.year, row.month) not in window:
            continue
        s_key = series_key(row, grouping_positions)
        i_key = item_key(row)
        by_item = result.setdefault(s_key, {})
        by_item[i_key] = by_item.get(i_key, Decimal(0)) + Decimal(row.quantity)

    return result


def items_of_series(
    rows: Iterable[HistoryRow],
    grouping_positions: Sequence[int],
) -> dict[SeriesKey, list[ItemKey]]:
    """Todos os itens de cada série, na ordem da primeira aparição.

    Distinto de `representativeness`: aqui entram TODOS os itens da série, mesmo
    os sem movimento no período de rateio. Eles precisam receber previsão — com
    peso zero, mas presentes no resultado.
    """
    result: dict[SeriesKey, list[ItemKey]] = {}
    seen: dict[SeriesKey, set[ItemKey]] = {}

    for row in rows:
        s_key = series_key(row, grouping_positions)
        i_key = item_key(row)
        known = seen.setdefault(s_key, set())
        if i_key not in known:
            known.add(i_key)
            result.setdefault(s_key, []).append(i_key)

    return result
