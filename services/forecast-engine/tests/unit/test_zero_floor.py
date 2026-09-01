"""Piso zero da previsão (FR-040a, FR-040b, D16).

A ordem importa mais que a operação: o piso vale para a série AGREGADA, antes do
rateio. Cortar depois do rateio faria os filhos deixarem de somar o pai, quebrando
a conservação exigida pelo FR-046.
"""

from __future__ import annotations

from decimal import Decimal

from forecast_engine.domain.proration import prorate
from forecast_engine.domain.zero_floor import apply_zero_floor, floor_value


def d(v: str) -> Decimal:
    return Decimal(v)


class TestFloorValue:
    def test_negativo_vira_zero(self) -> None:
        assert floor_value(d("-5.5")) == Decimal(0)

    def test_positivo_permanece(self) -> None:
        assert floor_value(d("5.5")) == d("5.5")

    def test_zero_permanece(self) -> None:
        assert floor_value(Decimal(0)) == Decimal(0)


class TestApplyZeroFloor:
    def test_corta_apenas_os_negativos(self) -> None:
        assert apply_zero_floor([d("-1"), d("0"), d("2")]) == [Decimal(0), Decimal(0), d("2")]

    def test_serie_toda_negativa_vira_toda_zero(self) -> None:
        assert apply_zero_floor([d("-1"), d("-2")]) == [Decimal(0), Decimal(0)]

    def test_entrada_vazia(self) -> None:
        assert apply_zero_floor([]) == []

    def test_nao_altera_serie_positiva(self) -> None:
        values = [d("1.5"), d("2.25")]
        assert apply_zero_floor(values) == values


class TestOrdemDasOperacoes:
    """A prova de que piso antes do rateio preserva a conservação."""

    def test_piso_antes_do_rateio_conserva_a_soma(self) -> None:
        parent = floor_value(d("-10.000000"))  # previsão negativa da série
        children = prorate(parent, ["3", "2"])
        assert sum(Decimal(c) for c in children) == parent
        assert children == ["0.000000", "0.000000"]

    def test_parent_positivo_conserva_apos_o_piso(self) -> None:
        parent = floor_value(d("100.000000"))
        children = prorate(parent, ["1", "1", "1"])
        assert sum(Decimal(c) for c in children) == parent

    def test_nenhum_filho_sai_negativo_com_pai_nao_negativo(self) -> None:
        children = prorate(d("10.000000"), ["7", "3"])
        assert all(Decimal(c) >= 0 for c in children)
