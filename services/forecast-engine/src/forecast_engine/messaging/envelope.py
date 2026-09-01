"""Envelope de mensageria — espelho de packages/contracts/src/messaging/envelope.ts.

Verificado contra os MESMOS vetores dourados que o lado TypeScript.

Ver: specs/001-sop-cycle-forecasting/contracts/messaging.md
"""

from __future__ import annotations

import re
from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, field_validator

# Versão corrente do contrato de mensageria.
MESSAGING_VERSION = 1

MessageType = Literal[
    "ingestion.request",
    "forecast.request",
    "forecast.result",
    "accuracy.request",
    "accuracy.result",
    "email.request",
]

_OBJECT_URI = re.compile(r"^s3://[a-z0-9.\-]+/.+$")


class Envelope(BaseModel):
    """Envelope comum de toda mensagem, em todas as filas.

    `correlation_id` é obrigatório desde a v1 (Princípio IX): sem ele, seguir um
    cálculo atravessando API, worker e motor vira arqueologia de timestamp.
    """

    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    message_id: UUID
    correlation_id: UUID
    occurred_at: datetime
    version: Literal[1]
    type: MessageType
    payload: Any

    @field_validator("occurred_at", mode="before")
    @classmethod
    def _exige_fuso(cls, value: Any) -> Any:
        """Data sem fuso é ambígua entre serviços em contêineres distintos."""
        if isinstance(value, str) and not re.search(r"(Z|[+-]\d{2}:\d{2})$", value):
            raise ValueError("occurredAt deve trazer fuso horário explícito")
        return value

    @classmethod
    def model_validate_wire(cls, data: dict[str, Any]) -> "Envelope":
        """Valida a forma que trafega na fila (camelCase)."""
        return cls.model_validate(
            {
                "message_id": data.get("messageId"),
                "correlation_id": data.get("correlationId"),
                "occurred_at": data.get("occurredAt"),
                "version": data.get("version"),
                "type": data.get("type"),
                "payload": data.get("payload"),
            }
        )


class JobReference(BaseModel):
    """Chave de idempotência: o job é a unidade de deduplicação (D6)."""

    model_config = ConfigDict(extra="forbid")

    jobId: UUID  # noqa: N815 - a forma que trafega no contrato é camelCase
    scenarioId: UUID  # noqa: N815


def is_object_uri(value: object) -> bool:
    """Verifica se é uma referência de objeto — nunca o dado em si (D5)."""
    return isinstance(value, str) and bool(_OBJECT_URI.match(value))


def parse_object_uri(value: object) -> str:
    if not is_object_uri(value):
        raise ValueError(f"esperado um URI s3://bucket/caminho, recebido {value!r}")
    return value  # type: ignore[return-value]
