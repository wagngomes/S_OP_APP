"""Codec decimal do motor — espelho de packages/contracts/src/decimal/decimal-string.ts.

Sustenta o Princípio V da constituição no lado Python. As duas implementações são
verificadas contra os MESMOS vetores dourados: uma divergência de interpretação
entre as linguagens quebra as duas suítes, que é exatamente o ponto.

Ver: specs/001-sop-cycle-forecasting/contracts/decimal-codec.md
"""

from __future__ import annotations

import re
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from typing import Iterable

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
    return _format(parse_decimal_string(value, scale), scale)


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
    return _format(d.quantize(_exponent(scale), rounding=DECIMAL_ROUNDING), scale)


def _format(d: Decimal, scale: int) -> str:
    """Serializa na forma canônica, com zero sem sinal."""
    if d == 0:
        d = Decimal(0)
    return f"{d.quantize(_exponent(scale), rounding=DECIMAL_ROUNDING):f}"


def prorate(parent: str | Decimal, weights: Iterable[str | Decimal], scale: int = DECIMAL_SCALE) -> list[str]:
    """Rateia `parent` entre os filhos pelos `weights`, fechando por maior resto.

    FR-046 exige que a soma dos filhos seja EXATAMENTE igual ao pai. Quantizar cada
    filho isoladamente não garante isso: sobra ou falta um resíduo na última casa.
    Por isso o fechamento por maior resto — o resíduo vai para quem tem a maior
    parte fracionária descartada.

    FR-047: quando não há representatividade alguma no período (todos os pesos
    zero), a divisão é igual entre os filhos. Zerar todos quebraria a conservação
    de soma que este algoritmo existe para garantir.
    """
    total = parent if isinstance(parent, Decimal) else Decimal(str(parent))
    ws = [w if isinstance(w, Decimal) else Decimal(str(w)) for w in weights]

    if not ws:
        return []

    weight_sum = sum(ws, Decimal(0))
    if weight_sum == 0:
        # Representatividade nula: divisão igual (FR-047).
        ws = [Decimal(1)] * len(ws)
        weight_sum = Decimal(len(ws))

    step = _exponent(scale)
    exact = [total * w / weight_sum for w in ws]
    floors = [e.quantize(step, rounding="ROUND_DOWN") for e in exact]

    residual = (total - sum(floors, Decimal(0))).quantize(step, rounding=DECIMAL_ROUNDING)
    units = int((residual / step).to_integral_value(rounding=DECIMAL_ROUNDING))

    # Maior resto primeiro; empate resolvido pela ordem original, para o
    # resultado ser determinístico (FR-087).
    order = sorted(range(len(ws)), key=lambda i: (-(exact[i] - floors[i]), i))

    direction = 1 if units >= 0 else -1
    for k in range(abs(units)):
        floors[order[k % len(order)]] += step * direction

    return [_format(f, scale) for f in floors]
