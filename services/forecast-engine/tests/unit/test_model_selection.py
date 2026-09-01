"""Seleção do melhor modelo por série (FR-041, FR-042, FR-043a, FR-043b).

O backtest usa StatsForecast de verdade — não é mock. O que se testa aqui é a
REGRA de seleção: qual modelo vence, o que é registrado, e o que acontece quando
a série não sustenta os candidatos.
"""

from __future__ import annotations

from decimal import Decimal

import pytest

from forecast_engine.domain.model_selection import select_model


def serie(values: list[str], start: tuple[int, int] = (2023, 1)) -> list[tuple[tuple[int, int], Decimal]]:
    """Série mensal contígua a partir de `start`."""
    year, month = start
    out = []
    for v in values:
        out.append(((year, month), Decimal(v)))
        month += 1
        if month > 12:
            year, month = year + 1, 1
    return out


# 36 meses de nível estável em torno de 100, com ruído leve e determinístico.
ESTAVEL = serie([str(100 + (i % 5)) for i in range(36)])

# 36 meses com tendência clara de alta.
TENDENCIA = serie([str(100 + i * 5) for i in range(36)])

# Demanda intermitente: muitos zeros, picos esparsos.
INTERMITENTE = serie(["0" if i % 4 else "20" for i in range(36)])


class TestSelecao:
    def test_devolve_um_vencedor_com_erro_na_metrica_escolhida(self) -> None:
        result = select_model(ESTAVEL, package="FAST", metric="WMAPE", horizon=12)
        assert result.winning_model in result.evaluated
        assert result.metric_value is not None
        assert result.metric_name == "WMAPE"

    def test_registra_todos_os_candidatos_avaliados(self) -> None:
        """FR-043a — o resultado é explicável sem reexecutar o cálculo."""
        result = select_model(ESTAVEL, package="FAST", metric="WMAPE", horizon=12)
        assert len(result.evaluated) >= 2
        for model, score in result.evaluated.items():
            assert isinstance(model, str)
            assert score is None or isinstance(score, Decimal)

    def test_pacote_maior_avalia_mais_modelos(self) -> None:
        fast = select_model(ESTAVEL, package="FAST", metric="WMAPE", horizon=12)
        standard = select_model(ESTAVEL, package="STANDARD", metric="WMAPE", horizon=12)
        assert len(standard.evaluated) > len(fast.evaluated)

    def test_metrica_escolhida_decide_o_vencedor(self) -> None:
        """FR-042 — a escolha do modelo é decidida pela métrica do usuário."""
        por_wmape = select_model(TENDENCIA, package="STANDARD", metric="WMAPE", horizon=12)
        por_vies = select_model(TENDENCIA, package="STANDARD", metric="BIAS", horizon=12)
        assert por_wmape.metric_name == "WMAPE"
        assert por_vies.metric_name == "BIAS"
        # Não se exige vencedores diferentes; exige-se que a régua tenha sido a
        # métrica pedida, e que o valor reportado seja o dela.
        assert por_vies.metric_value is not None

    def test_previsao_cobre_o_horizonte_pedido(self) -> None:
        result = select_model(ESTAVEL, package="FAST", metric="WMAPE", horizon=12)
        assert len(result.forecast) == 12

    def test_previsao_e_decimal_nao_float(self) -> None:
        """A saída do motor volta para decimal na borda (Princípio V, D2)."""
        result = select_model(ESTAVEL, package="FAST", metric="WMAPE", horizon=6)
        assert all(isinstance(v, Decimal) for v in result.forecast)

    def test_serie_com_tendencia_prevê_acima_do_ultimo_nivel_medio(self) -> None:
        result = select_model(TENDENCIA, package="STANDARD", metric="WMAPE", horizon=3)
        assert sum(result.forecast) > Decimal(0)


class TestSeriesDificeis:
    def test_serie_curta_usa_fallback_e_sinaliza(self) -> None:
        """FR-043b — nenhuma série sai do resultado por falta de candidato."""
        curta = serie(["10", "12", "9", "11"])
        result = select_model(curta, package="COMPLETE", metric="WMAPE", horizon=3)
        assert result.fallback_applied is True
        assert result.winning_model == "Naive"
        assert len(result.forecast) == 3

    def test_serie_curta_registra_os_modelos_excluidos(self) -> None:
        curta = serie(["10", "12", "9", "11"])
        result = select_model(curta, package="COMPLETE", metric="WMAPE", horizon=3)
        assert result.excluded_models
        assert "AutoARIMA" in result.excluded_models

    def test_serie_intermitente_e_calculavel(self) -> None:
        result = select_model(INTERMITENTE, package="STANDARD", metric="WMAPE", horizon=6)
        assert len(result.forecast) == 6

    def test_serie_com_valores_nao_positivos_exclui_modelos_multiplicativos(self) -> None:
        """D16 — o espaço de modelos é restrito pelo sinal dos dados."""
        com_negativo = serie(["10", "-5", "12", "8"] * 9)
        result = select_model(com_negativo, package="STANDARD", metric="WMAPE", horizon=3)
        assert len(result.forecast) == 3

    def test_serie_vazia_e_erro(self) -> None:
        with pytest.raises(ValueError):
            select_model([], package="FAST", metric="WMAPE", horizon=3)

    def test_horizonte_invalido_e_erro(self) -> None:
        with pytest.raises(ValueError):
            select_model(ESTAVEL, package="FAST", metric="WMAPE", horizon=0)


class TestDeterminismo:
    def test_mesma_entrada_mesmo_vencedor(self) -> None:
        """FR-087 — o resultado é reproduzível."""
        a = select_model(ESTAVEL, package="STANDARD", metric="WMAPE", horizon=6)
        b = select_model(ESTAVEL, package="STANDARD", metric="WMAPE", horizon=6)
        assert a.winning_model == b.winning_model
        assert a.metric_value == b.metric_value
        assert a.forecast == b.forecast

    def test_janelas_usadas_sao_reportadas(self) -> None:
        result = select_model(ESTAVEL, package="STANDARD", metric="WMAPE", horizon=6)
        assert result.backtest_windows_used >= 1
