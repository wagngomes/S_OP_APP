"""Rateio da previsão até a granularidade original (FR-045, FR-046, FR-047).

Este é um cálculo de S&OP, não um detalhe de serialização — por isso vive no
domínio e não junto do codec. O motor é o dono deste cálculo (Princípio III): a
API nunca o reimplementa.
"""

from __future__ import annotations

from decimal import ROUND_DOWN, Decimal
from typing import Iterable

from forecast_engine.domain.decimal_codec import DECIMAL_ROUNDING, DECIMAL_SCALE, format_decimal


def _exponent(scale: int) -> Decimal:
    return Decimal(1).scaleb(-scale)


def prorate(
    parent: str | Decimal,
    weights: Iterable[str | Decimal],
    scale: int = DECIMAL_SCALE,
) -> list[str]:
    """Rateia `parent` entre os filhos pelos `weights`, fechando por maior resto.

    FR-046 exige que a soma dos filhos seja EXATAMENTE igual ao pai. Quantizar
    cada filho isoladamente não garante isso: sobra ou falta um resíduo na última
    casa decimal. Por isso o fechamento por maior resto — o resíduo é distribuído,
    unidade a unidade, para quem teve a maior parte fracionária descartada.

    FR-047: quando não há representatividade alguma no período de rateio (todos os
    pesos zero), a divisão é igual entre os filhos. Zerar todos seria mais simples
    e quebraria a conservação de soma que este algoritmo existe para garantir — o
    total previsto para a série simplesmente sumiria.
    """
    total = parent if isinstance(parent, Decimal) else Decimal(str(parent))
    ws = [w if isinstance(w, Decimal) else Decimal(str(w)) for w in weights]

    if not ws:
        return []

    weight_sum = sum(ws, Decimal(0))
    if weight_sum == 0:
        ws = [Decimal(1)] * len(ws)
        weight_sum = Decimal(len(ws))

    step = _exponent(scale)
    exact = [total * w / weight_sum for w in ws]
    floors = [e.quantize(step, rounding=ROUND_DOWN) for e in exact]

    residual = (total - sum(floors, Decimal(0))).quantize(step, rounding=DECIMAL_ROUNDING)
    units = int((residual / step).to_integral_value(rounding=DECIMAL_ROUNDING))

    # Maior resto primeiro; empate resolvido pela ordem original, para que o
    # resultado seja determinístico entre execuções (FR-087).
    order = sorted(range(len(ws)), key=lambda i: (-(exact[i] - floors[i]), i))

    direction = 1 if units >= 0 else -1
    for k in range(abs(units)):
        floors[order[k % len(order)]] += step * direction

    return [format_decimal(f, scale) for f in floors]
