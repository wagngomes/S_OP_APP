"""Piso zero da previsão (FR-040a, FR-040b, FR-040c, D16).

A previsão de venda nunca é negativa. O que importa tanto quanto a regra é a
ORDEM em que ela se aplica:

    agregar → prever → PISO ZERO na série → ratear → quantizar

Aplicar o piso depois do rateio pareceria equivalente e não é: os filhos
deixariam de somar o pai, quebrando a conservação exigida pelo FR-046.

O piso vale para a SAÍDA. Quantidades negativas no histórico (devolução)
continuam válidas na entrada e entram normalmente na agregação (FR-040c).
"""

from __future__ import annotations

from decimal import Decimal
from typing import Iterable

ZERO = Decimal(0)


def floor_value(value: Decimal) -> Decimal:
    """Piso zero de um único valor previsto."""
    return value if value > ZERO else ZERO


def apply_zero_floor(values: Iterable[Decimal]) -> list[Decimal]:
    """Piso zero de uma série prevista, antes do rateio."""
    return [floor_value(v) for v in values]
