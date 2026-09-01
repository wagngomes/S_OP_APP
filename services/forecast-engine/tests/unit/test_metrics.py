"""Catálogo de métricas de acuracidade (FR-036, FR-037, FR-086).

Implementação ÚNICA no sistema. O Princípio III proíbe que a API reimplemente
qualquer uma destas fórmulas: se ela precisar de uma métrica, pede ao motor.
Duas implementações da mesma métrica divergem com o tempo e produzem dois números
para a mesma pergunta.

O mesmo catálogo serve ao backtest (acurácia do MODELO) e à apuração final
(acuracidade REALIZADA). Muda o momento e a base de cálculo, não a fórmula.
"""

from __future__ import annotations

from decimal import Decimal

import pytest

from forecast_engine.domain.metrics import (
    METRIC_NAMES,
    bias,
    compute_metric,
    is_lower_better,
    mape,
    wmape,
)


def D(*values: str) -> list[Decimal]:
    return [Decimal(v) for v in values]


class TestCatalogo:
    def test_expoe_as_tres_metricas_da_especificacao(self) -> None:
        assert set(METRIC_NAMES) == {"WMAPE", "MAPE", "BIAS"}

    def test_compute_metric_despacha_pelo_nome(self) -> None:
        actual, forecast = D("100"), D("90")
        assert compute_metric("WMAPE", actual, forecast) == wmape(actual, forecast)
        assert compute_metric("MAPE", actual, forecast) == mape(actual, forecast)
        assert compute_metric("BIAS", actual, forecast) == bias(actual, forecast)

    def test_metrica_desconhecida_e_erro(self) -> None:
        with pytest.raises(ValueError):
            compute_metric("RMSE", D("1"), D("1"))

    def test_erro_menor_e_melhor_menos_para_o_vies(self) -> None:
        # Viés é direcional: -0.1 e +0.1 são igualmente ruins, e 0 é o ideal.
        # Por isso a seleção do modelo usa o valor ABSOLUTO do viés.
        assert is_lower_better("WMAPE") is True
        assert is_lower_better("MAPE") is True
        assert is_lower_better("BIAS") is True


class TestWmape:
    def test_previsao_perfeita_da_erro_zero(self) -> None:
        assert wmape(D("10", "20"), D("10", "20")) == Decimal(0)

    def test_erro_e_a_soma_dos_desvios_sobre_a_soma_do_realizado(self) -> None:
        # |100-90| + |50-50| = 10 ; soma do realizado = 150 ; 10/150
        result = wmape(D("100", "50"), D("90", "50"))
        assert result == (Decimal(10) / Decimal(150)).quantize(Decimal("0.000001"))

    def test_e_definido_com_realizado_zero_em_alguns_meses(self) -> None:
        # É exatamente por isto que WMAPE é o padrão: o zero pontual não explode.
        assert wmape(D("0", "100"), D("10", "90")) is not None

    def test_indefinido_quando_todo_o_realizado_e_zero(self) -> None:
        assert wmape(D("0", "0"), D("5", "5")) is None

    def test_penaliza_erro_grande_em_item_grande(self) -> None:
        pequeno = wmape(D("1000", "1"), D("1000", "2"))
        grande = wmape(D("1000", "1"), D("900", "1"))
        assert grande is not None and pequeno is not None
        assert grande > pequeno


class TestMape:
    def test_previsao_perfeita_da_erro_zero(self) -> None:
        assert mape(D("10", "20"), D("10", "20")) == Decimal(0)

    def test_media_dos_erros_percentuais(self) -> None:
        # |100-90|/100 = 0.1 ; |50-40|/50 = 0.2 ; média = 0.15
        assert mape(D("100", "50"), D("90", "40")) == Decimal("0.150000")

    def test_ignora_periodos_com_realizado_zero(self) -> None:
        """FR-086 — denominador zero tem comportamento explícito.

        O ponto é descartado do cálculo, não tratado como erro infinito nem como
        acerto. Tratá-lo como zero premiaria a previsão errada.
        """
        com_zero = mape(D("0", "100"), D("50", "90"))
        sem_zero = mape(D("100"), D("90"))
        assert com_zero == sem_zero

    def test_indefinido_quando_todo_o_realizado_e_zero(self) -> None:
        assert mape(D("0", "0"), D("5", "5")) is None

    def test_explode_com_realizado_pequeno_e_por_isso_avisamos(self) -> None:
        # Demanda intermitente: 1 unidade realizada, 10 previstas => |1-10|/1 = 9,
        # ou seja 900% de erro num único item. É por isso que o sistema avisa ao
        # escolher MAPE em cenário com muitos zeros (FR-036a): um punhado de itens
        # de giro baixo passa a decidir qual modelo vence.
        assert mape(D("1"), D("10")) == Decimal("9.000000")

    def test_wmape_nao_explode_no_mesmo_caso(self) -> None:
        # Mesma entrada, métrica ponderada: o erro continua proporcional ao volume.
        assert wmape(D("1"), D("10")) == Decimal("9.000000")
        # Mas com um item grande ao lado, o WMAPE dilui e o MAPE não.
        assert wmape(D("1", "1000"), D("10", "1000")) < mape(D("1", "1000"), D("10", "1000"))


class TestBias:
    def test_previsao_perfeita_da_vies_zero(self) -> None:
        assert bias(D("10", "20"), D("10", "20")) == Decimal(0)

    def test_previsao_acima_do_realizado_da_vies_positivo(self) -> None:
        result = bias(D("100"), D("110"))
        assert result is not None and result > 0

    def test_previsao_abaixo_do_realizado_da_vies_negativo(self) -> None:
        result = bias(D("100"), D("90"))
        assert result is not None and result < 0

    def test_erros_opostos_se_cancelam(self) -> None:
        # É a característica do viés: mede tendência sistemática, não magnitude.
        assert bias(D("100", "100"), D("110", "90")) == Decimal(0)

    def test_indefinido_quando_todo_o_realizado_e_zero(self) -> None:
        assert bias(D("0", "0"), D("5", "5")) is None


class TestInvariantes:
    def test_series_de_tamanhos_diferentes_e_erro(self) -> None:
        with pytest.raises(ValueError):
            wmape(D("1", "2"), D("1"))

    def test_series_vazias_sao_indefinidas(self) -> None:
        assert wmape([], []) is None
        assert mape([], []) is None
        assert bias([], []) is None

    @pytest.mark.parametrize("name", ["WMAPE", "MAPE", "BIAS"])
    def test_resultado_esta_na_escala_do_sistema(self, name: str) -> None:
        result = compute_metric(name, D("100", "70"), D("90", "80"))
        assert result is not None
        assert result == result.quantize(Decimal("0.000001"))

    @pytest.mark.parametrize("name", ["WMAPE", "MAPE", "BIAS"])
    def test_calculo_e_deterministico(self, name: str) -> None:
        args = (D("100", "70", "3"), D("90", "80", "4"))
        assert compute_metric(name, *args) == compute_metric(name, *args)

    def test_aritmetica_e_exata_sem_ponto_flutuante(self) -> None:
        # 0.1 + 0.2 em float daria 0.30000000000000004 e o erro entraria aqui.
        assert wmape(D("0.1", "0.2"), D("0.1", "0.2")) == Decimal(0)
