"""Catálogo de modelos em três pacotes e configuração de backtest (D1, D14).

O pacote define, junto, os modelos candidatos E a profundidade do backtest —
porque as duas coisas são o mesmo eixo de custo: mais análise, mais tempo.

A configuração de backtest merece atenção porque ela DETERMINA qual modelo vence
cada série: dois valores de janela produzem dois vencedores para os mesmos dados.
Por isso é versionada junto com o catálogo (FR-043e).
"""

from __future__ import annotations

import pytest

from forecast_engine.domain.backtest_config import (
    BACKTEST_HORIZON,
    MODEL_MIN_TRAINING_MONTHS,
    backtest_config,
    feasible_models,
    usable_windows,
)
from forecast_engine.domain.model_catalog import (
    CATALOG_VERSION,
    MODEL_PACKAGES,
    ModelPackage,
    models_of_package,
)


class TestPacotes:
    def test_tem_os_tres_pacotes_da_especificacao(self) -> None:
        assert set(MODEL_PACKAGES) == {"FAST", "STANDARD", "COMPLETE"}

    def test_pacotes_sao_cumulativos(self) -> None:
        fast = set(models_of_package("FAST"))
        standard = set(models_of_package("STANDARD"))
        complete = set(models_of_package("COMPLETE"))
        assert fast < standard < complete

    def test_contagem_de_modelos_por_pacote(self) -> None:
        assert len(models_of_package("FAST")) == 4
        assert len(models_of_package("STANDARD")) == 7
        assert len(models_of_package("COMPLETE")) == 8

    def test_naive_esta_em_todos_os_pacotes(self) -> None:
        """SC-011 usa o Naive como régua; ele nunca pode faltar."""
        for pkg in MODEL_PACKAGES:
            assert "Naive" in models_of_package(pkg)

    def test_autoarima_so_no_completo(self) -> None:
        """O mais caro do catálogo fica isolado — é o que torna o Standard usável
        em cenário grande."""
        assert "AutoARIMA" not in models_of_package("STANDARD")
        assert "AutoARIMA" in models_of_package("COMPLETE")

    def test_croston_a_partir_do_standard(self) -> None:
        assert "CrostonOptimized" not in models_of_package("FAST")
        assert "CrostonOptimized" in models_of_package("STANDARD")

    def test_pacote_desconhecido_e_erro(self) -> None:
        with pytest.raises(ValueError):
            models_of_package("TURBO")  # type: ignore[arg-type]

    def test_versao_do_catalogo_e_declarada(self) -> None:
        """FR-043c — a versão fixa catálogo e backtest de cada execução."""
        assert isinstance(CATALOG_VERSION, str) and CATALOG_VERSION


class TestBacktestConfig:
    def test_janelas_crescem_com_o_pacote(self) -> None:
        assert backtest_config("FAST").windows == 1
        assert backtest_config("STANDARD").windows == 3
        assert backtest_config("COMPLETE").windows == 4

    def test_horizonte_de_avaliacao_e_o_mesmo_nos_tres(self) -> None:
        for pkg in MODEL_PACKAGES:
            assert backtest_config(pkg).horizon == BACKTEST_HORIZON == 3

    def test_janelas_nao_se_sobrepoem(self) -> None:
        for pkg in MODEL_PACKAGES:
            cfg = backtest_config(pkg)
            assert cfg.step == cfg.horizon

    def test_meses_de_teste_exigidos(self) -> None:
        # 3 janelas de 3 meses, sem sobreposição = 9 meses de teste.
        assert backtest_config("STANDARD").test_months == 9


class TestModelosViaveisPorSerie:
    def test_serie_longa_admite_todos_do_pacote(self) -> None:
        viable, excluded = feasible_models("COMPLETE", history_months=60)
        assert set(viable) == set(models_of_package("COMPLETE"))
        assert excluded == {}

    def test_serie_curta_exclui_os_sazonais(self) -> None:
        # Sazonais precisam de 24 meses de treino para enxergar um ciclo inteiro.
        viable, excluded = feasible_models("COMPLETE", history_months=20)
        assert "SeasonalNaive" not in viable
        assert "AutoARIMA" not in viable
        assert "SeasonalNaive" in excluded

    def test_serie_muito_curta_sobra_apenas_o_basico(self) -> None:
        viable, _ = feasible_models("COMPLETE", history_months=10)
        assert "Naive" in viable
        assert "AutoETS" not in viable

    def test_serie_curtissima_nao_fica_sem_modelo(self) -> None:
        """FR-043b — nenhuma série sai do resultado por falta de candidato."""
        viable, excluded = feasible_models("COMPLETE", history_months=1)
        assert viable == ["Naive"]
        assert excluded

    def test_motivo_da_exclusao_e_registrado(self) -> None:
        _, excluded = feasible_models("COMPLETE", history_months=12)
        assert "AutoARIMA" in excluded
        assert "24" in excluded["AutoARIMA"]

    def test_minimos_declarados_por_modelo(self) -> None:
        assert MODEL_MIN_TRAINING_MONTHS["Naive"] == 6
        assert MODEL_MIN_TRAINING_MONTHS["AutoETS"] == 12
        assert MODEL_MIN_TRAINING_MONTHS["SeasonalNaive"] == 24


class TestJanelasUtilizaveis:
    def test_serie_longa_usa_todas_as_janelas_do_pacote(self) -> None:
        assert usable_windows("STANDARD", history_months=60) == 3

    def test_limite_exato_ainda_usa_todas_as_janelas(self) -> None:
        # STANDARD: 3 janelas x 3 meses = 9 de avaliação. Com 15 meses sobram 6
        # de treino, que é exatamente o mínimo do modelo mais barato.
        assert usable_windows("STANDARD", history_months=15) == 3

    def test_serie_curta_cai_para_a_maior_configuracao_viavel(self) -> None:
        """D14 — em vez de descartar a série, reduz-se a profundidade.

        Com 14 meses sobram 5 de treino para 3 janelas, abaixo do mínimo de 6.
        O motor recua para 2 janelas (6 de avaliação, 8 de treino) em vez de
        deixar a série fora do resultado.
        """
        assert usable_windows("STANDARD", history_months=14) == 2

    def test_nunca_menos_que_uma_janela_quando_ha_historico(self) -> None:
        assert usable_windows("COMPLETE", history_months=9) >= 1

    def test_zero_janelas_quando_nao_da_para_avaliar(self) -> None:
        assert usable_windows("STANDARD", history_months=3) == 0
