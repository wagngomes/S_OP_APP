"""Schema de payload de ingestion.request — espelha o schema Zod.

Ver: specs/001-sop-cycle-forecasting/contracts/messaging.md
"""

from __future__ import annotations

from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, field_validator


class IngestionRequestPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    jobId: UUID  # noqa: N815
    scenarioId: UUID  # noqa: N815
    kind: Literal["SALES_HISTORY"]
    objectUri: str  # noqa: N815
    declaredLabels: list[str]  # noqa: N815
    uploadedById: UUID  # noqa: N815

    @field_validator("objectUri")
    @classmethod
    def _s3_uri(cls, v: str) -> str:
        import re
        if not re.match(r"^s3://[a-z0-9.\-]+/.+$", v):
            raise ValueError(f"esperado um URI s3://bucket/caminho, recebido {v!r}")
        return v

    @field_validator("declaredLabels")
    @classmethod
    def _nao_vazio(cls, v: list[str]) -> list[str]:
        if not v:
            raise ValueError("declaredLabels não pode ser vazio")
        return v
