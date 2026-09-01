"""Codec decimal do motor — espelho de packages/contracts/src/decimal/decimal-string.ts.

Sustenta o Princípio V da constituição no lado Python. As duas implementações são
verificadas contra os MESMOS vetores dourados: uma divergência de interpretação
entre as linguagens quebra as duas suítes, que é exatamente o ponto.

Ver: specs/001-sop-cycle-forecasting/contracts/decimal-codec.md
"""

from __future__ import annotations

import re
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

# Casas decimais de quantidade, previsão e métrica.
DECIMAL_SCALE = 6

# Política de arredondamento única do sistema.
DECIMAL_ROUNDING = ROUND_HALF_UP


def _grammar(scale: int) -> re.Pattern[str]:
    return re.compile(rf"^-?\d+(\.\d{{1,{scale}}})?$")


def _exponent(scale: int) -> Decimal:
    return Decimal(1).scaleb(-scale)


def is_decimal_string(value: object, scale: int = DECIMAL_SCALE) -> bool:
    """Verifica a gramática do contrato sem lançar."""
    return isinstance(value, str) and bool(_grammar(scale).match(value))


def parse_decimal_string(value: object, scale: int = DECIMAL_SCALE) -> Decimal:
    """Valida e converte um valor que ATRAVESSOU a fronteira.

    No máximo `scale` casas: mais que isso é erro de quem produziu o valor, e
    arredondar em silêncio esconderia o defeito em vez de expô-lo.
    """
    if not is_decimal_string(value, scale):
        raise ValueError(f"decimal inválido no contrato: {value!r}")
    return Decimal(value)  # type: ignore[arg-type]


def canonical(value: object, scale: int = DECIMAL_SCALE) -> str:
    """Forma canônica de um valor já válido no contrato."""
    return format_decimal(parse_decimal_string(value, scale), scale)


def quantize(value: str | float | int | Decimal, scale: int = DECIMAL_SCALE) -> str:
    """Traz um valor de precisão arbitrária para a escala do sistema.

    Distinto de `parse_decimal_string`: aqui as casas extras são ESPERADAS. Esta é
    a conversão da saída do motor, ao trazer o resultado de volta do float64 — a
    única região do sistema onde ponto flutuante existe.
    """
    try:
        d = value if isinstance(value, Decimal) else Decimal(str(value))
    except InvalidOperation as exc:  # pragma: no cover - defensivo
        raise ValueError(f"valor não conversível para decimal: {value!r}") from exc
    if not d.is_finite():
        raise ValueError(f"valor não finito não atravessa o contrato: {value!r}")
    return format_decimal(d.quantize(_exponent(scale), rounding=DECIMAL_ROUNDING), scale)


def format_decimal(d: Decimal, scale: int) -> str:
    """Serializa na forma canônica, com zero sem sinal."""
    if d == 0:
        d = Decimal(0)
    return f"{d.quantize(_exponent(scale), rounding=DECIMAL_ROUNDING):f}"
