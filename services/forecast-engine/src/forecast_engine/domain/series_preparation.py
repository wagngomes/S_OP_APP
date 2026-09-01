"""Preparo da série para modelagem (FR-040d, D15).

StatsForecast exige frequência regular: buraco no meio distorce ou quebra o
ajuste. Mas os dois tipos de buraco têm significados OPOSTOS:

- lacuna no meio da vida de um item ativo → mês sem venda é venda zero;
- meses anteriores à primeira venda → não é zero, é ausência de vida.

Preencher o prefixo ensina ao modelo uma demanda zero que nunca existiu, e ele
projeta perto de zero para sempre. É o erro que mata a previsão de item novo, e
não aparece em lugar nenhum: o número sai, só sai errado.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Mapping

Period = tuple[int, int]

ZERO = Decimal(0)


def _index(period: Period) -> int:
    """Converte (ano, mês) em um inteiro contínuo, para aritmética de meses."""
    year, month = period
    return year * 12 + (month - 1)


def _period(index: int) -> Period:
    return (index // 12, index % 12 + 1)


def month_range(start: Period, end: Period) -> list[Period]:
    """Meses consecutivos de `start` a `end`, inclusive. Vazio se invertido."""
    first, last = _index(start), _index(end)
    if last < first:
        return []
    return [_period(i) for i in range(first, last + 1)]


def prepare_series(points: Mapping[Period, Decimal]) -> list[tuple[Period, Decimal]]:
    """Devolve a série contígua, ordenada, pronta para o ajuste.

    Corta tudo antes do primeiro mês com movimento e preenche com zero as lacunas
    internas. Zeros DEPOIS da primeira venda são preservados: item que vendeu e
    parou é informação real de demanda, não ausência de dado.

    Movimento inclui valor negativo: uma devolução isolada indica que houve venda
    antes do início do histórico.
    """
    if not points:
        return []

    ordered = sorted(points.items(), key=lambda kv: _index(kv[0]))

    first_movement = next((p for p, v in ordered if v != ZERO), None)
    if first_movement is None:
        # Série inteiramente zerada: não há vida a modelar.
        return []

    last_period = ordered[-1][0]
    return [(p, points.get(p, ZERO)) for p in month_range(first_movement, last_period)]


def next_periods(last: Period, count: int) -> list[Period]:
    """Os `count` meses seguintes a `last` — o horizonte da previsão (FR-040)."""
    if count < 1:
        return []
    start = _index(last) + 1
    return [_period(i) for i in range(start, start + count)]
