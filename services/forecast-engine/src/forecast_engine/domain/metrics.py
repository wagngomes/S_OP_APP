"""Catálogo de métricas de acuracidade (FR-036, FR-037, FR-086).

**Implementação única no sistema.** O Princípio III da constituição proíbe que o
serviço de orquestração reimplemente qualquer fórmula daqui: se a API precisar de
uma métrica, ela pede ao motor. Duas implementações da mesma métrica envelhecem de
forma desigual e passam a produzir dois números para a mesma pergunta — que é
exatamente o que a fronteira entre serviços existe para impedir.

O mesmo catálogo serve a dois momentos distintos (FR-037):

- **acurácia do MODELO** — backtest sobre o histórico, na fase de previsão;
- **acuracidade REALIZADA** — previsão publicada contra venda real, na apuração.

Muda a base de cálculo, não a fórmula.

Aritmética decimal em todo o percurso: somar desvios em ponto flutuante
reintroduziria o erro que o Princípio V mantém fora do sistema.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Callable, Sequence

from forecast_engine.domain.decimal_codec import DECIMAL_ROUNDING, DECIMAL_SCALE

METRIC_NAMES: tuple[str, ...] = ("WMAPE", "MAPE", "BIAS")

ZERO = Decimal(0)


def _step(scale: int) -> Decimal:
    return Decimal(1).scaleb(-scale)


def _quantize(value: Decimal, scale: int) -> Decimal:
    return value.quantize(_step(scale), rounding=DECIMAL_ROUNDING)


def _check(actual: Sequence[Decimal], forecast: Sequence[Decimal]) -> None:
    if len(actual) != len(forecast):
        raise ValueError(
            f"séries de tamanhos diferentes: {len(actual)} realizados e {len(forecast)} previstos"
        )


def wmape(
    actual: Sequence[Decimal],
    forecast: Sequence[Decimal],
    scale: int = DECIMAL_SCALE,
) -> Decimal | None:
    """Erro absoluto ponderado pelo volume.

    `soma(|real - previsto|) / soma(|real|)`

    É a métrica padrão do sistema (FR-036a) porque continua definida quando um mês
    tem realizado zero — situação corriqueira em demanda intermitente, onde o MAPE
    passa a ser dirigido por ruído.

    Devolve `None` quando o denominador é zero, isto é, quando não houve realizado
    algum no período (FR-086). Nesse caso não existe erro relativo a apurar.
    """
    _check(actual, forecast)
    if not actual:
        return None

    denominator = sum((abs(a) for a in actual), ZERO)
    if denominator == ZERO:
        return None

    numerator = sum((abs(a - f) for a, f in zip(actual, forecast)), ZERO)
    return _quantize(numerator / denominator, scale)


def mape(
    actual: Sequence[Decimal],
    forecast: Sequence[Decimal],
    scale: int = DECIMAL_SCALE,
) -> Decimal | None:
    """Média dos erros percentuais absolutos.

    `média(|real - previsto| / |real|)`

    Períodos com realizado zero são **descartados** do cálculo (FR-086), não
    tratados como erro infinito nem como acerto: contá-los como zero premiaria uma
    previsão errada, e contá-los como infinito faria um único mês zerado dominar a
    métrica inteira.

    Devolve `None` quando não sobra nenhum período utilizável.
    """
    _check(actual, forecast)

    ratios: list[Decimal] = []
    for a, f in zip(actual, forecast):
        if a == ZERO:
            continue
        ratios.append(abs(a - f) / abs(a))

    if not ratios:
        return None

    return _quantize(sum(ratios, ZERO) / Decimal(len(ratios)), scale)


def bias(
    actual: Sequence[Decimal],
    forecast: Sequence[Decimal],
    scale: int = DECIMAL_SCALE,
) -> Decimal | None:
    """Viés relativo — tendência sistemática de errar para cima ou para baixo.

    `soma(previsto - real) / soma(|real|)`

    Positivo indica previsão sistematicamente acima do realizado; negativo, abaixo.
    Diferente das outras duas, erros opostos se cancelam: o viés mede DIREÇÃO, não
    magnitude. Um viés zero não significa previsão boa, significa previsão sem
    tendência — por isso ele complementa o WMAPE em vez de substituí-lo.
    """
    _check(actual, forecast)
    if not actual:
        return None

    denominator = sum((abs(a) for a in actual), ZERO)
    if denominator == ZERO:
        return None

    numerator = sum((f - a for a, f in zip(actual, forecast)), ZERO)
    return _quantize(numerator / denominator, scale)


_REGISTRY: dict[str, Callable[..., Decimal | None]] = {
    "WMAPE": wmape,
    "MAPE": mape,
    "BIAS": bias,
}


def compute_metric(
    name: str,
    actual: Sequence[Decimal],
    forecast: Sequence[Decimal],
    scale: int = DECIMAL_SCALE,
) -> Decimal | None:
    """Aplica a métrica escolhida pelo usuário antes do cálculo (FR-042)."""
    fn = _REGISTRY.get(name)
    if fn is None:
        raise ValueError(f"métrica desconhecida: {name!r}; disponíveis: {', '.join(METRIC_NAMES)}")
    return fn(actual, forecast, scale)


def is_lower_better(name: str) -> bool:
    """Se um valor menor da métrica indica um modelo melhor.

    Vale para as três, com uma ressalva sobre o viés: ele é direcional, e -0,1 é
    tão ruim quanto +0,1. Por isso a seleção do modelo compara o valor ABSOLUTO —
    ver `selection_value`.
    """
    if name not in _REGISTRY:
        raise ValueError(f"métrica desconhecida: {name!r}")
    return True


def selection_value(name: str, value: Decimal) -> Decimal:
    """Valor comparável para escolher o melhor modelo de uma série.

    Para WMAPE e MAPE é o próprio erro. Para o viés é o módulo: o objetivo é a
    ausência de tendência, não a tendência mais negativa.
    """
    return abs(value) if name == "BIAS" else value
