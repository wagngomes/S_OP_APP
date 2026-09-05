"""
Consumidor de `sop.forecast.request.v1` e publicador de resultado (T091, T093).

Camada de mensageria — a única que conhece AMQP. Não contém regra de negócio:
orquestra a chamada à camada de aplicação e decide ACK/NACK.

Fluxo por mensagem:
  1. Deserializa o envelope e extrai o jobId.
  2. Verifica idempotência: se _SUCCESS já existe, republica o resultado
     sem recalcular (D6, T093).
  3. Lê o dataset Parquet do MinIO (referência D5 — nunca o dado em si na fila).
  4. Chama run_forecast (camada de aplicação).
  5. Grava output.parquet, series.parquet e _SUCCESS no MinIO (D18).
  6. Publica `sop.forecast.result.v1` com a referência ao prefixo de saída.
  7. ACK se tudo ocorreu; NACK sem requeue se exceção não recuperável.
"""

from __future__ import annotations

import json
import logging
import os
from uuid import UUID, uuid4
from datetime import datetime, timezone
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    import pika
    from pika.adapters.blocking_connection import BlockingChannel
    from pika.spec import Basic, BasicProperties

_logger = logging.getLogger(__name__)

QUEUE_REQUEST = "sop.forecast.request.v1"
QUEUE_RESULT = "sop.forecast.result.v1"
EXCHANGE_FORECAST = "sop.forecast"

HEADER_RETRY_COUNT = "x-sop-retry-count"
MAX_RETRIES = 3
DELAYS_MS = [1_000, 8_000, 64_000]


def _now_iso() -> str:
    return datetime.now(tz=timezone.utc).isoformat()


class ForecastConsumer:
    """Consumidor do job de previsão.

    Injetado com as dependências de infraestrutura para que os testes possam
    substituí-las sem broker nem MinIO reais.
    """

    def __init__(
        self,
        channel: "BlockingChannel",
        object_store,  # ObjectStore — injetado
        dataset_reader,  # DatasetReader — injetado
        result_writer,  # ResultWriter — injetado
    ) -> None:
        self._channel = channel
        self._store = object_store
        self._reader = dataset_reader
        self._writer = result_writer

    def start(self) -> None:
        """Inicia o loop de consumo bloqueante."""
        self._channel.basic_qos(prefetch_count=1)
        self._channel.basic_consume(QUEUE_REQUEST, on_message_callback=self._on_message)
        _logger.info("aguardando mensagens em %s", QUEUE_REQUEST)
        self._channel.start_consuming()

    def _on_message(
        self,
        ch: "BlockingChannel",
        method: "Basic.Deliver",
        properties: "BasicProperties",
        body: bytes,
    ) -> None:
        retry_count = int((properties.headers or {}).get(HEADER_RETRY_COUNT, 0))
        try:
            self._handle(body, properties)
            ch.basic_ack(delivery_tag=method.delivery_tag)
        except Exception:
            _logger.exception("falha ao processar mensagem (tentativa %d/%d)", retry_count + 1, MAX_RETRIES + 1)
            if retry_count >= MAX_RETRIES:
                ch.basic_nack(delivery_tag=method.delivery_tag, requeue=False)
                return

            ch.basic_ack(delivery_tag=method.delivery_tag)
            import time
            delay_ms = DELAYS_MS[retry_count] if retry_count < len(DELAYS_MS) else DELAYS_MS[-1]
            time.sleep(delay_ms / 1000)

            new_headers = {**(properties.headers or {}), HEADER_RETRY_COUNT: retry_count + 1}
            import pika
            ch.basic_publish(
                exchange="",
                routing_key=QUEUE_REQUEST,
                body=body,
                properties=pika.BasicProperties(
                    content_type=properties.content_type,
                    delivery_mode=2,
                    headers=new_headers,
                ),
            )

    def _handle(self, body: bytes, properties: "BasicProperties") -> None:
        envelope = json.loads(body)
        payload = envelope.get("payload", {})
        job_id = str(payload.get("jobId", ""))
        scenario_id = str(payload.get("scenarioId", ""))
        input_uri = str(payload.get("inputUri", ""))
        output_prefix = str(payload.get("outputPrefix", ""))
        params_raw = payload.get("params", {})
        correlation_id = str(envelope.get("correlationId", ""))

        _logger.info(
            "processando job",
            extra={"jobId": job_id, "scenarioId": scenario_id, "correlationId": correlation_id},
        )

        # D6 — idempotência: se _SUCCESS existe, republica sem recalcular (T093)
        if self._store.is_complete(output_prefix):
            _logger.info("resultado já existe — republicando sem recalcular (D6)", extra={"jobId": job_id})
            self._publish_result(job_id, scenario_id, output_prefix, correlation_id)
            return

        # Lê dataset, executa cálculo, grava resultado
        from forecast_engine.application.dataset_reader import DatasetReader
        from forecast_engine.application.forecast_job import ForecastParams, run_forecast
        from forecast_engine.domain.model_catalog import ModelPackage
        from forecast_engine.adapters.observability import jobs_total, job_duration_seconds, rows_processed_total

        rows = self._reader.read(input_uri)
        params = ForecastParams(
            grouping_positions=list(params_raw.get("groupingPositions", [])),
            proration_months=int(params_raw.get("prorationMonths", 3)),
            horizon_months=int(params_raw.get("horizonMonths", 3)),
            metric=str(params_raw.get("metric", "WMAPE")),
            package=ModelPackage(str(params_raw.get("package", "FAST"))),
        )

        with job_duration_seconds.time():
            outcome = run_forecast(rows, params)

        rows_processed_total.inc(len(outcome.items))
        self._writer.write(output_prefix, outcome)
        self._store.write_success_marker(output_prefix)
        jobs_total.labels(outcome="success").inc()

        self._publish_result(job_id, scenario_id, output_prefix, correlation_id)

    def _publish_result(
        self,
        job_id: str,
        scenario_id: str,
        output_prefix: str,
        correlation_id: str,
    ) -> None:
        import pika

        result_envelope = {
            "messageId": str(uuid4()),
            "correlationId": correlation_id,
            "occurredAt": _now_iso(),
            "version": 1,
            "type": "forecast.result",
            "payload": {
                "jobId": job_id,
                "scenarioId": scenario_id,
                "outputPrefix": output_prefix,
                "status": "COMPLETED",
            },
        }
        self._channel.basic_publish(
            exchange=EXCHANGE_FORECAST,
            routing_key=QUEUE_RESULT,
            body=json.dumps(result_envelope).encode(),
            properties=pika.BasicProperties(
                content_type="application/json",
                delivery_mode=2,
            ),
        )
