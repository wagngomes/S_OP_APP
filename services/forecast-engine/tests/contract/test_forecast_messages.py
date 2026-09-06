"""Teste de contrato bilateral de forecast.request, forecast.result e ingestion.request.

Lê os MESMOS vetores dourados que o Vitest (packages/contracts/src/golden/forecast.json).
Uma divergência de interpretação entre as linguagens quebra as duas suítes.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest
from pydantic import ValidationError

from forecast_engine.messaging.forecast import (
    ForecastRequestPayload,
    parse_forecast_result,
)
from forecast_engine.messaging.ingestion import IngestionRequestPayload

REPO_ROOT = Path(__file__).parents[4]
GOLDEN = json.loads(
    (REPO_ROOT / "packages" / "contracts" / "src" / "golden" / "forecast.json").read_text(
        encoding="utf-8"
    )
)

pytestmark = pytest.mark.contract


# --- ForecastRequest ----------------------------------------------------------


@pytest.mark.parametrize(
    "case", GOLDEN["forecastRequest"]["accept"], ids=lambda c: c["name"]
)
def test_forecast_request_aceito(case: dict[str, Any]) -> None:
    req = ForecastRequestPayload.model_validate(case["payload"])
    assert req.jobId is not None


@pytest.mark.parametrize(
    "case", GOLDEN["forecastRequest"]["reject"], ids=lambda c: c["name"]
)
def test_forecast_request_recusado(case: dict[str, Any]) -> None:
    with pytest.raises((ValidationError, ValueError)):
        ForecastRequestPayload.model_validate(case["payload"])


# --- ForecastResult -----------------------------------------------------------


@pytest.mark.parametrize(
    "case", GOLDEN["forecastResult"]["accept"], ids=lambda c: c["name"]
)
def test_forecast_result_aceito(case: dict[str, Any]) -> None:
    result = parse_forecast_result(case["payload"])
    assert result.jobId is not None


@pytest.mark.parametrize(
    "case", GOLDEN["forecastResult"]["reject"], ids=lambda c: c["name"]
)
def test_forecast_result_recusado(case: dict[str, Any]) -> None:
    with pytest.raises((ValidationError, ValueError)):
        parse_forecast_result(case["payload"])


def test_resultado_concluido_tem_uris() -> None:
    case = next(c for c in GOLDEN["forecastResult"]["accept"] if c["name"] == "result-concluido")
    from forecast_engine.messaging.forecast import ForecastResultCompleted
    result = ForecastResultCompleted.model_validate(case["payload"])
    assert str(result.outputUri).startswith("s3://")
    assert result.failure is None


def test_resultado_falhou_tem_failure() -> None:
    case = next(c for c in GOLDEN["forecastResult"]["accept"] if c["name"] == "result-falhou")
    from forecast_engine.messaging.forecast import ForecastResultFailed
    result = ForecastResultFailed.model_validate(case["payload"])
    assert result.failure.code
    assert result.outputUri is None


# --- IngestionRequest ---------------------------------------------------------


@pytest.mark.parametrize(
    "case", GOLDEN["ingestionRequest"]["accept"], ids=lambda c: c["name"]
)
def test_ingestion_request_aceito(case: dict[str, Any]) -> None:
    req = IngestionRequestPayload.model_validate(case["payload"])
    assert req.jobId is not None
    assert len(req.declaredLabels) >= 1


@pytest.mark.parametrize(
    "case", GOLDEN["ingestionRequest"]["reject"], ids=lambda c: c["name"]
)
def test_ingestion_request_recusado(case: dict[str, Any]) -> None:
    with pytest.raises((ValidationError, ValueError)):
        IngestionRequestPayload.model_validate(case["payload"])
