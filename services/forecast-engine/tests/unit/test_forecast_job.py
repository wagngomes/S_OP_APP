"""Orquestração completa do job de previsão (T089, T092).

Este é o teste que amarra tudo: agregação, preparo da série, seleção de modelo,
piso zero, rateio e emissão do resultado na granularidade original.

O que se prova aqui não é uma função isolada — é que as peças compostas produzem
um resultado íntegro. Em especial a conservação de soma (FR-046) atravessando o
pipeline inteiro, que é onde ela realmente corre risco.
"""

from __future__ import annotations

from decimal import Decimal

import pytest

from forecast_engine.application.forecast_job import ForecastParams, run_forecast
from forecast_engine.domain.aggregation import HistoryRow


def build_history(
    months: int = 30,
    items: tuple[tuple[str, tuple[str, ...]], ...] = (
        ("P1", ("ESP", "Delivery", "1029")),
        ("P2", ("ESP", "Delivery", "2030")),
        ("P3", ("SUL", "Retail", "3040")),
    ),
    base: int = 100,
) -> list[HistoryRow]:
    """Histórico sintético contíguo, determinístico."""
    rows: list[HistoryRow] = []
    year, month = 2024, 1
    for i in range(months):
        for k, (product, segments) in enumerate(items):
            rows.append(
                HistoryRow(
                    product_code=product,
                    segments=segments,
                    year=year,
                    month=month,
                    quantity=str(base + (i % 7) + k * 10),
                )
            )
        month += 1
        if month > 12:
            year, month = year + 1, 1
    return rows


PARAMS = ForecastParams(
    grouping_positions=[0],
    proration_months=12,
    horizon_months=6,
    metric="WMAPE",
    package="FAST",
)


class TestResultadoBasico:
    def test_produz_series_e_itens(self) -> None:
        outcome = run_forecast(build_history(), PARAMS)
        assert outcome.series
        assert outcome.items

    def test_uma_serie_por_valor_distinto_do_nivel_agrupado(self) -> None:
        outcome = run_forecast(build_history(), PARAMS)
        assert {s.series_key for s in outcome.series} == {("ESP",), ("SUL",)}

    def test_um_item_por_combinacao_e_mes_do_horizonte(self) -> None:
        outcome = run_forecast(build_history(), PARAMS)
        # 3 itens x 6 meses
        assert len(outcome.items) == 18

    def test_itens_saem_na_granularidade_original(self) -> None:
        outcome = run_forecast(build_history(), PARAMS)
        item = outcome.items[0]
        assert item.product_code in {"P1", "P2", "P3"}
        assert len(item.segments) == 3

    def test_horizonte_comeca_no_mes_seguinte_ao_historico(self) -> None:
        outcome = run_forecast(build_history(months=30), PARAMS)
        # 30 meses a partir de 2024-01 terminam em 2026-06; a previsão começa em 07.
        periods = sorted({(i.year, i.month) for i in outcome.items})
        assert periods[0] == (2026, 7)
        assert len(periods) == 6

    def test_cada_serie_reporta_modelo_vencedor_e_erro(self) -> None:
        outcome = run_forecast(build_history(), PARAMS)
        for s in outcome.series:
            assert s.winning_model
            assert s.evaluated


class TestConservacaoNoPipeline:
    """FR-046 atravessando o pipeline inteiro — o teste que mais importa."""

    def test_soma_dos_itens_e_exatamente_a_previsao_da_serie(self) -> None:
        outcome = run_forecast(build_history(), PARAMS)

        for s in outcome.series:
            for period, parent in s.forecast_by_period.items():
                filhos = [
                    Decimal(i.quantity)
                    for i in outcome.items
                    if i.series_key == s.series_key and (i.year, i.month) == period
                ]
                assert sum(filhos, Decimal(0)) == parent

    def test_conservacao_vale_com_agrupamento_mais_granular(self) -> None:
        params = ForecastParams(
            grouping_positions=[0, 1],
            proration_months=12,
            horizon_months=3,
            metric="WMAPE",
            package="FAST",
        )
        outcome = run_forecast(build_history(), params)
        for s in outcome.series:
            for period, parent in s.forecast_by_period.items():
                filhos = [
                    Decimal(i.quantity)
                    for i in outcome.items
                    if i.series_key == s.series_key and (i.year, i.month) == period
                ]
                assert sum(filhos, Decimal(0)) == parent


class TestRegrasDeNegocio:
    def test_nenhum_item_sai_negativo(self) -> None:
        """FR-040a — o piso zero atravessa o pipeline."""
        outcome = run_forecast(build_history(), PARAMS)
        assert all(Decimal(i.quantity) >= 0 for i in outcome.items)

    def test_quantidades_saem_como_string_decimal(self) -> None:
        """Princípio V — nada sai do motor em ponto flutuante."""
        outcome = run_forecast(build_history(), PARAMS)
        for i in outcome.items:
            assert isinstance(i.quantity, str)
            assert Decimal(i.quantity) == Decimal(i.quantity).quantize(Decimal("0.000001"))

    def test_rateio_usa_apenas_a_janela_pedida(self) -> None:
        """FR-045 — a representatividade vem dos N meses escolhidos."""
        curto = ForecastParams(
            grouping_positions=[0],
            proration_months=3,
            horizon_months=3,
            metric="WMAPE",
            package="FAST",
        )
        longo = ForecastParams(
            grouping_positions=[0],
            proration_months=24,
            horizon_months=3,
            metric="WMAPE",
            package="FAST",
        )
        # Histórico com um item que só vende no fim: janelas diferentes devem
        # produzir rateios diferentes.
        rows = build_history(months=30)
        rows.append(
            HistoryRow("P9", ("ESP", "Delivery", "9999"), 2026, 6, "5000.000000")
        )
        a = run_forecast(rows, curto)
        b = run_forecast(rows, longo)
        peso_a = next(Decimal(i.quantity) for i in a.items if i.product_code == "P9")
        peso_b = next(Decimal(i.quantity) for i in b.items if i.product_code == "P9")
        assert peso_a != peso_b

    def test_item_sem_movimento_na_janela_recebe_zero_mas_aparece(self) -> None:
        """FR-047 — item sem representatividade não some do resultado."""
        rows = build_history(months=30)
        rows.append(HistoryRow("P8", ("ESP", "Delivery", "8888"), 2024, 1, "10.000000"))
        outcome = run_forecast(rows, PARAMS)
        p8 = [i for i in outcome.items if i.product_code == "P8"]
        assert len(p8) == PARAMS.horizon_months
        assert all(Decimal(i.quantity) == 0 for i in p8)


class TestBordas:
    def test_historico_vazio_e_erro(self) -> None:
        with pytest.raises(ValueError):
            run_forecast([], PARAMS)

    def test_serie_curta_nao_impede_o_job(self) -> None:
        outcome = run_forecast(build_history(months=4), PARAMS)
        assert outcome.items
        assert any(s.fallback_applied for s in outcome.series)

    def test_resultado_e_deterministico(self) -> None:
        """FR-087 — mesma entrada, mesmo resultado."""
        rows = build_history()
        a = run_forecast(rows, PARAMS)
        b = run_forecast(rows, PARAMS)
        assert [i.quantity for i in a.items] == [i.quantity for i in b.items]
        assert [s.winning_model for s in a.series] == [s.winning_model for s in b.series]

    def test_agrupamento_vazio_produz_visao_cia(self) -> None:
        params = ForecastParams(
            grouping_positions=[],
            proration_months=12,
            horizon_months=3,
            metric="WMAPE",
            package="FAST",
        )
        outcome = run_forecast(build_history(), params)
        assert len(outcome.series) == 1
