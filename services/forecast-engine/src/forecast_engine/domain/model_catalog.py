"""Catálogo de modelos em três pacotes (D1, FR-043, FR-043d).

O custo de um cálculo é aproximadamente:

    séries × modelos × janelas de backtest × custo do ajuste

e o número de séries é escolhido pelo usuário ao arrastar a combinação de níveis.
Um catálogo único transformaria uma escolha inocente de agrupamento — `BU` versus
`BU+Setor+CD` — em minutos versus horas, sem que ninguém percebesse antes de
disparar. Os pacotes devolvem esse controle ao usuário de forma legível.

Os pacotes são CUMULATIVOS: FAST ⊂ STANDARD ⊂ COMPLETE.
"""

from __future__ import annotations

from typing import Literal, get_args

ModelPackage = Literal["FAST", "STANDARD", "COMPLETE"]

MODEL_PACKAGES: tuple[ModelPackage, ...] = get_args(ModelPackage)

CATALOG_VERSION = "2026.08"
"""Fixa catálogo E configuração de backtest de cada execução (FR-043c, FR-043e).

Trocar modelo ou janela exige incrementar esta versão. Execuções já registradas
continuam explicáveis: nada é recalculado retroativamente.
"""

# Ordem estável — entra no resultado e em `evaluatedModels`, e o empate na
# seleção é resolvido por ela (FR-087).
_FAST: tuple[str, ...] = (
    "Naive",
    "SeasonalNaive",
    "HistoricAverage",
    "WindowAverage",
)

_STANDARD_ADDS: tuple[str, ...] = (
    "AutoETS",
    "AutoTheta",
    "CrostonOptimized",
)

# AutoARIMA fica sozinho aqui porque é, de longe, o mais caro: busca stepwise
# refeita a cada janela de validação. Isolá-lo é o que torna o STANDARD utilizável
# em cenário com muitas séries.
_COMPLETE_ADDS: tuple[str, ...] = ("AutoARIMA",)

_PACKAGES: dict[ModelPackage, tuple[str, ...]] = {
    "FAST": _FAST,
    "STANDARD": _FAST + _STANDARD_ADDS,
    "COMPLETE": _FAST + _STANDARD_ADDS + _COMPLETE_ADDS,
}


def models_of_package(package: ModelPackage) -> tuple[str, ...]:
    """Modelos candidatos do pacote, na ordem estável do catálogo."""
    models = _PACKAGES.get(package)
    if models is None:
        raise ValueError(
            f"pacote desconhecido: {package!r}; disponíveis: {', '.join(MODEL_PACKAGES)}"
        )
    return models
