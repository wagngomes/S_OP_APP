"""Agregação do histórico até a combinação de níveis escolhida (FR-039)."""

from __future__ import annotations

from decimal import Decimal

import pytest

from forecast_engine.domain.aggregation import (
    HistoryRow,
    aggregate_series,
    item_key,
    representativeness,
    series_key,
)


def row(
    product: str = "P1",
    segments: tuple[str, ...] = ("ESP", "Delivery", "1029"),
    year: int = 2026,
    month: int = 3,
    quantity: str = "10.000000",
) -> HistoryRow:
    return HistoryRow(
        product_code=product, segments=segments, year=year, month=month, quantity=quantity
    )


class TestSeriesKey:
    def test_usa_apenas_as_posicoes_do_agrupamento(self) -> None:
        assert series_key(row(), [0]) == ("ESP",)
        assert series_key(row(), [0, 1]) == ("ESP", "Delivery")

    def test_combinacao_respeita_a_ordem_declarada_nao_a_do_usuario(self) -> None:
        # Arrastar Setor antes de BU não pode gerar uma série diferente: a
        # hierarquia é a do layout declarado.
        assert series_key(row(), [1, 0]) == series_key(row(), [0, 1])

    def test_item_key_e_a_granularidade_original(self) -> None:
        assert item_key(row()) == ("P1", ("ESP", "Delivery", "1029"))


class TestAggregateSeries:
    def test_soma_itens_da_mesma_serie_e_periodo(self) -> None:
        rows = [
            row(product="P1", quantity="10.000000"),
            row(product="P2", quantity="5.000000"),
        ]
        result = aggregate_series(rows, [0])
        assert result[("ESP",)][(2026, 3)] == Decimal("15.000000")

    def test_separa_series_distintas(self) -> None:
        rows = [
            row(segments=("ESP", "Delivery", "1029")),
            row(segments=("SUL", "Delivery", "1029")),
        ]
        result = aggregate_series(rows, [0])
        assert set(result) == {("ESP",), ("SUL",)}

    def test_separa_periodos(self) -> None:
        rows = [row(month=3), row(month=4)]
        result = aggregate_series(rows, [0])
        assert set(result[("ESP",)]) == {(2026, 3), (2026, 4)}

    def test_soma_e_exata_sem_erro_de_ponto_flutuante(self) -> None:
        rows = [row(product="A", quantity="0.100000"), row(product="B", quantity="0.200000")]
        result = aggregate_series(rows, [0])
        assert result[("ESP",)][(2026, 3)] == Decimal("0.300000")

    def test_devolucao_negativa_abate_na_agregacao(self) -> None:
        rows = [row(product="A", quantity="10.000000"), row(product="B", quantity="-4.000000")]
        result = aggregate_series(rows, [0])
        assert result[("ESP",)][(2026, 3)] == Decimal("6.000000")

    def test_combinacao_mais_granular_gera_mais_series(self) -> None:
        rows = [
            row(segments=("ESP", "Delivery", "1029")),
            row(segments=("ESP", "Retail", "1029")),
        ]
        assert len(aggregate_series(rows, [0])) == 1
        assert len(aggregate_series(rows, [0, 1])) == 2

    def test_entrada_vazia(self) -> None:
        assert aggregate_series([], [0]) == {}

    def test_posicoes_vazias_agregam_tudo_numa_serie_so(self) -> None:
        # Visão Cia: sem segmentação.
        rows = [row(segments=("ESP", "A", "1")), row(segments=("SUL", "B", "2"))]
        result = aggregate_series(rows, [])
        assert list(result) == [()]
        assert result[()][(2026, 3)] == Decimal("20.000000")


class TestRepresentativeness:
    def test_peso_de_cada_item_na_sua_serie(self) -> None:
        rows = [
            row(product="A", quantity="30.000000"),
            row(product="B", quantity="10.000000"),
        ]
        weights = representativeness(rows, [0], months=[(2026, 3)])
        assert weights[("ESP",)][("A", ("ESP", "Delivery", "1029"))] == Decimal("30.000000")
        assert weights[("ESP",)][("B", ("ESP", "Delivery", "1029"))] == Decimal("10.000000")

    def test_considera_apenas_os_meses_do_periodo_de_rateio(self) -> None:
        rows = [
            row(product="A", month=3, quantity="30.000000"),
            row(product="A", month=1, quantity="999.000000"),
        ]
        weights = representativeness(rows, [0], months=[(2026, 3)])
        assert weights[("ESP",)][("A", ("ESP", "Delivery", "1029"))] == Decimal("30.000000")

    def test_item_sem_movimento_no_periodo_tem_peso_zero(self) -> None:
        rows = [
            row(product="A", month=3, quantity="30.000000"),
            row(product="B", month=1, quantity="50.000000"),
        ]
        weights = representativeness(rows, [0], months=[(2026, 3)])
        key_b = ("B", ("ESP", "Delivery", "1029"))
        assert weights[("ESP",)].get(key_b, Decimal(0)) == Decimal(0)

    @pytest.mark.parametrize("months", [[], [(2020, 1)]])
    def test_periodo_sem_historico_devolve_pesos_zerados(self, months: list) -> None:
        rows = [row(product="A", quantity="30.000000")]
        weights = representativeness(rows, [0], months=months)
        total = sum(weights.get(("ESP",), {}).values(), Decimal(0))
        assert total == Decimal(0)
