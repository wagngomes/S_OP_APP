"""Schemas de payload de forecast.request e forecast.result — espelha os schemas Zod.

Verificado contra os MESMOS vetores dourados que o lado TypeScript.

Ver: specs/001-sop-cycle-forecasting/contracts/messaging.md
"""

from __future__ import annotations

from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, field_validator


class ForecastRequestParams(BaseModel):
    model_config = ConfigDict(extra="forbid")

    groupingLabels: list[str]  # noqa: N815
    granularLabels: list[str]  # noqa: N815
    prorationMonths: int  # noqa: N815
    horizonMonths: int  # noqa: N815
    accuracyMetric: Literal["WMAPE", "MAPE", "BIAS"]  # noqa: N815
    modelPackage: Literal["FAST", "STANDARD", "COMPLETE"]  # noqa: N815
    decimalScale: int  # noqa: N815
    nonNegativeForecast: bool  # noqa: N815

    @field_validator("groupingLabels", "granularLabels")
    @classmethod
    def _nao_vazio(cls, v: list[str]) -> list[str]:
        if not v:
            raise ValueError("lista de rótulos não pode ser vazia")
        return v

    @field_validator("prorationMonths", "horizonMonths")
    @classmethod
    def _positivo(cls, v: int) -> int:
        if v < 1:
            raise ValueError("deve ser pelo menos 1")
        return v

    @field_validator("decimalScale")
    @classmethod
    def _escala_valida(cls, v: int) -> int:
        if not 1 <= v <= 10:
            raise ValueError("decimalScale deve estar entre 1 e 10")
        return v


class ForecastRequestPayload(BaseModel):
    """Payload de `forecast.request` — o motor recebe rótulos, não ids do banco (Princípio III)."""

    model_config = ConfigDict(extra="forbid")

    jobId: UUID  # noqa: N815
    scenarioId: UUID  # noqa: N815
    inputUri: str  # noqa: N815
    outputPrefix: str  # noqa: N815
    modelCatalogVersion: str  # noqa: N815
    params: ForecastRequestParams

    @field_validator("inputUri", "outputPrefix")
    @classmethod
    def _s3_uri(cls, v: str) -> str:
        import re
        if not re.match(r"^s3://[a-z0-9.\-]+/.+$", v):
            raise ValueError(f"esperado um URI s3://bucket/caminho, recebido {v!r}")
        return v


class ForecastStats(BaseModel):
    model_config = ConfigDict(extra="forbid")

    seriesCount: int  # noqa: N815
    itemCount: int  # noqa: N815
    durationMs: int  # noqa: N815


class ForecastFailure(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: str
    message: str


class ForecastResultCompleted(BaseModel):
    model_config = ConfigDict(extra="forbid")

    jobId: UUID  # noqa: N815
    status: Literal["completed"]
    outputUri: str  # noqa: N815
    seriesUri: str  # noqa: N815
    modelCatalogVersion: str  # noqa: N815
    stats: ForecastStats
    failure: None

    @field_validator("outputUri", "seriesUri")
    @classmethod
    def _s3_uri(cls, v: str) -> str:
        import re
        if not re.match(r"^s3://[a-z0-9.\-]+/.+$", v):
            raise ValueError(f"esperado um URI s3://bucket/caminho, recebido {v!r}")
        return v


class ForecastResultFailed(BaseModel):
    model_config = ConfigDict(extra="forbid")

    jobId: UUID  # noqa: N815
    status: Literal["failed"]
    outputUri: None  # noqa: N815
    seriesUri: None  # noqa: N815
    modelCatalogVersion: str  # noqa: N815
    stats: None
    failure: ForecastFailure


def parse_forecast_result(data: dict) -> ForecastResultCompleted | ForecastResultFailed:
    """Analisa o payload de resultado discriminando pelo campo `status`."""
    status = data.get("status")
    if status == "completed":
        return ForecastResultCompleted.model_validate(data)
    if status == "failed":
        return ForecastResultFailed.model_validate(data)
    raise ValueError(f"status inválido: {status!r}; esperado 'completed' ou 'failed'")
