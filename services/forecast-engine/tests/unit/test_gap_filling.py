"""Preparo da série para modelagem: lacunas e início de vida (FR-040d, D15).

O teste central é o de item novo: preencher os meses anteriores à primeira venda
ensina ao modelo uma demanda zero que nunca existiu, e ele passa a projetar perto
de zero para sempre. É o erro que mata a previsão de item recém-lançado, e é
silencioso — o número sai, só sai errado.
"""

from __future__ import annotations

from decimal import Decimal

from forecast_engine.domain.series_preparation import month_range, prepare_series


def d(v: str) -> Decimal:
    return Decimal(v)


class TestMonthRange:
    def test_gera_meses_consecutivos(self) -> None:
        assert month_range((2026, 1), (2026, 4)) == [(2026, 1), (2026, 2), (2026, 3), (2026, 4)]

    def test_atravessa_a_virada_do_ano(self) -> None:
        assert month_range((2025, 11), (2026, 2)) == [
            (2025, 11),
            (2025, 12),
            (2026, 1),
            (2026, 2),
        ]

    def test_mesmo_mes_devolve_um_ponto(self) -> None:
        assert month_range((2026, 5), (2026, 5)) == [(2026, 5)]

    def test_intervalo_invertido_devolve_vazio(self) -> None:
        assert month_range((2026, 5), (2026, 1)) == []


class TestPrepareSeries:
    def test_serie_completa_permanece_intacta(self) -> None:
        points = {(2026, 1): d("10"), (2026, 2): d("20"), (2026, 3): d("30")}
        assert prepare_series(points) == [
            ((2026, 1), d("10")),
            ((2026, 2), d("20")),
            ((2026, 3), d("30")),
        ]

    def test_preenche_lacuna_interna_com_zero(self) -> None:
        points = {(2026, 1): d("10"), (2026, 4): d("40")}
        assert prepare_series(points) == [
            ((2026, 1), d("10")),
            ((2026, 2), d("0")),
            ((2026, 3), d("0")),
            ((2026, 4), d("40")),
        ]

    def test_mes_com_venda_zero_no_meio_e_preservado(self) -> None:
        points = {(2026, 1): d("10"), (2026, 2): d("0"), (2026, 3): d("30")}
        assert len(prepare_series(points)) == 3

    def test_corta_o_prefixo_anterior_a_primeira_venda(self) -> None:
        # Item lançado em março: janeiro e fevereiro não são zero, são ausência
        # de vida. Preenchê-los enviesaria o modelo para baixo.
        points = {(2026, 1): d("0"), (2026, 2): d("0"), (2026, 3): d("30"), (2026, 4): d("40")}
        result = prepare_series(points)
        assert result[0][0] == (2026, 3)
        assert len(result) == 2

    def test_nao_corta_zeros_depois_da_primeira_venda(self) -> None:
        # Item que vendeu e parou: os zeros do fim são informação real de demanda.
        points = {(2026, 1): d("30"), (2026, 2): d("0"), (2026, 3): d("0")}
        assert len(prepare_series(points)) == 3

    def test_primeira_venda_negativa_conta_como_movimento(self) -> None:
        # Uma devolução isolada indica que houve venda antes do histórico.
        points = {(2026, 1): d("0"), (2026, 2): d("-5"), (2026, 3): d("10")}
        assert prepare_series(points)[0][0] == (2026, 2)

    def test_serie_inteiramente_zerada_fica_vazia(self) -> None:
        points = {(2026, 1): d("0"), (2026, 2): d("0")}
        assert prepare_series(points) == []

    def test_entrada_vazia(self) -> None:
        assert prepare_series({}) == []

    def test_resultado_e_sempre_contiguo_e_ordenado(self) -> None:
        points = {(2026, 5): d("5"), (2025, 12): d("1"), (2026, 2): d("2")}
        result = prepare_series(points)
        periods = [p for p, _ in result]
        assert periods == month_range((2025, 12), (2026, 5))
