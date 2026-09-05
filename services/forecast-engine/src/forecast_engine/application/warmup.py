"""
Warm-up do statsforecast/numba no boot do motor (D18).

StatsForecast usa numba para JIT-compilar os modelos na primeira chamada.
Sem warm-up, a primeira mensagem real tem latência extra de segundos; o contêiner
parece travar no healthcheck logo após subir.

A estratégia: rodar uma previsão mínima (1 série, 2 pontos, horizonte 1) com
o pacote Rápido na inicialização. Isso garante que o JIT compilou o bytecode
necessário antes de o consumidor AMQP registrar seu first-ACK.
"""

from __future__ import annotations

import logging
from decimal import Decimal

_logger = logging.getLogger(__name__)

_WARMUP_SERIES: list[tuple[tuple[int, int], Decimal]] = [
    ((2024, 1), Decimal("10")),
    ((2024, 2), Decimal("12")),
    ((2024, 3), Decimal("11")),
]


def warmup_models() -> None:
    """Força a compilação JIT de todos os modelos do catálogo Rápido.

    Deve ser chamado uma vez, no boot, antes de o consumidor AMQP começar
    a processar mensagens. Qualquer exceção é silenciada — um warm-up que
    falha não deve impedir o motor de subir.
    """
    try:
        from forecast_engine.domain.model_catalog import ModelPackage
        from forecast_engine.domain.model_selection import select_model

        select_model(
            _WARMUP_SERIES,
            package="FAST",
            metric="WMAPE",
            horizon=1,
        )
        _logger.info("warmup concluído — modelos JIT compilados")
    except Exception:
        _logger.warning(
            "warmup falhou — motor continuará com latência na 1ª mensagem",
            exc_info=True,
        )
