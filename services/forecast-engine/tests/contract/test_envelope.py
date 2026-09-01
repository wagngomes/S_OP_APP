"""Teste de contrato bilateral do envelope de mensageria.

Lê os MESMOS vetores dourados que o Vitest. Uma divergência de interpretação
entre as linguagens quebra as duas suítes.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest
from pydantic import ValidationError

from forecast_engine.domain.decimal_codec import is_decimal_string, parse_decimal_string
from forecast_engine.messaging.envelope import (
    MESSAGING_VERSION,
    Envelope,
    is_object_uri,
    parse_object_uri,
)

REPO_ROOT = Path(__file__).parents[4]
GOLDEN = json.loads(
    (REPO_ROOT / "packages" / "contracts" / "src" / "golden" / "envelope.json").read_text(
        encoding="utf-8"
    )
)

pytestmark = pytest.mark.contract


def test_versao_bate_com_o_contrato() -> None:
    assert MESSAGING_VERSION == GOLDEN["version"]


@pytest.mark.parametrize("case", GOLDEN["accept"], ids=lambda c: c["name"])
def test_aceita(case: dict[str, Any]) -> None:
    envelope = Envelope.model_validate_wire(case["message"])
    assert envelope.version == MESSAGING_VERSION


@pytest.mark.parametrize("case", GOLDEN["reject"], ids=lambda c: c["name"])
def test_recusa(case: dict[str, Any]) -> None:
    with pytest.raises((ValidationError, ValueError)):
        Envelope.model_validate_wire(case["message"])


@pytest.mark.parametrize("uri", GOLDEN["objectUri"]["accept"], ids=repr)
def test_object_uri_aceito(uri: str) -> None:
    assert parse_object_uri(uri) == uri


@pytest.mark.parametrize("uri", GOLDEN["objectUri"]["reject"], ids=repr)
def test_object_uri_recusado(uri: str) -> None:
    assert is_object_uri(uri) is False
    with pytest.raises(ValueError):
        parse_object_uri(uri)


def test_grandeza_sensivel_como_numero_json_e_recusada() -> None:
    """Princípio V na fronteira da fila."""
    payload = GOLDEN["sensitiveNumberInPayload"]["reject"]
    assert is_decimal_string(payload["quantity"]) is False
    with pytest.raises(ValueError):
        parse_decimal_string(payload["quantity"])


def test_grandeza_sensivel_como_string_decimal_e_aceita() -> None:
    payload = GOLDEN["sensitiveNumberInPayload"]["accept"]
    assert str(parse_decimal_string(payload["quantity"])) == "1234.500000"
