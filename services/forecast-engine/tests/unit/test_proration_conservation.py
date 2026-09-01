"""Conservação de soma no rateio (FR-046).

Teste de propriedade: para QUALQUER pai e QUAISQUER pesos, a soma dos filhos é
exatamente igual ao pai. Sem tolerância — é isso que separa um sistema de
planejamento confiável de um que "quase" fecha.
"""

from __future__ import annotations

from decimal import Decimal

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from forecast_engine.domain.proration import prorate

SCALE = Decimal("0.000001")

parents = st.decimals(
    min_value=Decimal("-1000000"),
    max_value=Decimal("1000000"),
    places=6,
    allow_nan=False,
    allow_infinity=False,
)

weight_lists = st.lists(
    st.decimals(min_value=Decimal(0), max_value=Decimal("10000"), places=6, allow_nan=False),
    min_size=1,
    max_size=12,
)


class TestPropriedadeDeConservacao:
    @settings(max_examples=300, deadline=None)
    @given(parent=parents, weights=weight_lists)
    def test_soma_dos_filhos_e_exatamente_o_pai(
        self, parent: Decimal, weights: list[Decimal]
    ) -> None:
        children = prorate(parent, weights)
        assert sum(Decimal(c) for c in children) == parent

    @settings(max_examples=200, deadline=None)
    @given(parent=parents, weights=weight_lists)
    def test_devolve_um_filho_por_peso(self, parent: Decimal, weights: list[Decimal]) -> None:
        assert len(prorate(parent, weights)) == len(weights)

    @settings(max_examples=200, deadline=None)
    @given(parent=parents, weights=weight_lists)
    def test_todo_filho_esta_na_escala_do_sistema(
        self, parent: Decimal, weights: list[Decimal]
    ) -> None:
        for c in prorate(parent, weights):
            assert Decimal(c) == Decimal(c).quantize(SCALE)


class TestCasosDeBorda:
    def test_pai_zero_zera_todos(self) -> None:
        assert prorate(Decimal(0), ["1", "2", "3"]) == ["0.000000"] * 3

    def test_peso_unico_recebe_tudo(self) -> None:
        assert prorate(Decimal("77.777777"), ["9"]) == ["77.777777"]

    def test_sem_pesos_devolve_vazio(self) -> None:
        assert prorate(Decimal("10"), []) == []

    def test_pesos_todos_zero_divide_igual_e_conserva(self) -> None:
        """FR-047 — sem representatividade, divisão igual; zerar quebraria a soma."""
        children = prorate(Decimal("10.000000"), ["0", "0", "0"])
        assert sum(Decimal(c) for c in children) == Decimal("10.000000")

    def test_pai_negativo_conserva(self) -> None:
        children = prorate(Decimal("-10.000000"), ["1", "1", "1"])
        assert sum(Decimal(c) for c in children) == Decimal("-10.000000")

    def test_residuo_vai_para_o_maior_resto(self) -> None:
        # 10 / 3 = 3.333333... — o resíduo de 0.000001 vai para o primeiro,
        # que é determinístico no empate.
        assert prorate(Decimal("10.000000"), ["1", "1", "1"]) == [
            "3.333334",
            "3.333333",
            "3.333333",
        ]

    def test_e_deterministico(self) -> None:
        """FR-087 — a mesma entrada devolve sempre o mesmo resultado."""
        args = (Decimal("123.456789"), ["7", "3", "5", "1"])
        assert prorate(*args) == prorate(*args) == prorate(*args)

    @pytest.mark.parametrize(
        "parent,weights",
        [
            (Decimal("0.000001"), ["1", "1"]),
            (Decimal("0.000002"), ["1", "1", "1"]),
            (Decimal("-0.000001"), ["1", "1"]),
        ],
    )
    def test_residuo_menor_que_o_numero_de_filhos(
        self, parent: Decimal, weights: list[str]
    ) -> None:
        """Quando o pai é menor que a granularidade, alguém fica com zero — mas
        a soma continua fechando."""
        children = prorate(parent, weights)
        assert sum(Decimal(c) for c in children) == parent
