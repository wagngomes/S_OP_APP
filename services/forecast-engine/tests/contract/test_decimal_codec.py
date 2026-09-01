"""Teste de contrato bilateral do codec decimal.

Lê os MESMOS vetores dourados que o lado TypeScript. Uma divergência de
interpretação entre as linguagens quebra esta suíte e a do Vitest.
"""

from __future__ import annotations

import json
from decimal import Decimal
from pathlib import Path

import pytest

from forecast_engine.domain.proration import prorate
from forecast_engine.domain.decimal_codec import (
    DECIMAL_SCALE,
    canonical,
    is_decimal_string,
    parse_decimal_string,
    quantize,
)

REPO_ROOT = Path(__file__).parents[4]
GOLDEN = json.loads(
    (REPO_ROOT / "packages" / "contracts" / "src" / "golden" / "decimal.json").read_text(
        encoding="utf-8"
    )
)

pytestmark = pytest.mark.contract


def test_escala_bate_com_o_contrato() -> None:
    assert DECIMAL_SCALE == GOLDEN["scale"]


@pytest.mark.parametrize("case", GOLDEN["parse"]["accept"], ids=lambda c: c["input"])
def test_parse_aceita_e_canonicaliza(case: dict[str, str]) -> None:
    assert canonical(case["input"]) == case["canonical"]
    assert is_decimal_string(case["input"]) is True


@pytest.mark.parametrize("bad", GOLDEN["parse"]["reject"], ids=repr)
def test_parse_rejeita(bad: str) -> None:
    assert is_decimal_string(bad) is False
    with pytest.raises(ValueError):
        parse_decimal_string(bad)


def test_parse_rejeita_float_nativo() -> None:
    # O ponto do Princípio V: aceitar 1.5 como float reintroduziria o erro
    # que o contrato existe para manter fora.
    assert is_decimal_string(1.5) is False
    with pytest.raises(ValueError):
        parse_decimal_string(1.5)


@pytest.mark.parametrize("case", GOLDEN["quantize"]["cases"], ids=lambda c: c["input"])
def test_quantize(case: dict[str, str]) -> None:
    assert quantize(case["input"]) == case["expected"]


def test_quantize_a_partir_de_float() -> None:
    assert quantize(0.1 + 0.2) == "0.300000"


def test_quantize_rejeita_nao_finito() -> None:
    with pytest.raises(ValueError):
        quantize(float("inf"))
    with pytest.raises(ValueError):
        quantize(float("nan"))


@pytest.mark.parametrize("case", GOLDEN["proration"]["cases"], ids=lambda c: c["name"])
def test_rateio_bate_com_os_vetores(case: dict[str, object]) -> None:
    got = prorate(case["parent"], case["weights"])  # type: ignore[arg-type]
    assert got == case["expected"]


@pytest.mark.parametrize("case", GOLDEN["proration"]["cases"], ids=lambda c: c["name"])
def test_rateio_conserva_a_soma(case: dict[str, object]) -> None:
    """FR-046: a soma dos filhos é EXATAMENTE igual ao pai, sem tolerância."""
    got = prorate(case["parent"], case["weights"])  # type: ignore[arg-type]
    assert sum(Decimal(x) for x in got) == Decimal(str(case["parent"]))
