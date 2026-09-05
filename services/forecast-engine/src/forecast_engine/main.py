"""Ponto de entrada do motor de previsão (T058).

Sequência de boot:
  1. Configurar logging estruturado (structlog → JSON).
  2. Configurar métricas Prometheus e subir o servidor HTTP de scrape.
  3. Conectar ao RabbitMQ.
  4. Warm-up dos modelos statsforecast/numba (D18).
  5. Iniciar o loop de consumo bloqueante.

A estrutura em camadas é explícita: esta função resolve dependências e injeta.
Nem ForecastConsumer nem as camadas de domínio conhecem os detalhes de conexão.
"""

from __future__ import annotations

import logging
import os

import boto3
import pika

from forecast_engine.adapters.object_store import ObjectStore
from forecast_engine.adapters.observability import configure_logging, configure_metrics
from forecast_engine.application.warmup import warmup_models
from forecast_engine.messaging.forecast_consumer import ForecastConsumer


def main() -> None:
    configure_logging()
    configure_metrics()

    logger = logging.getLogger(__name__)

    # Conexão MinIO/S3
    s3_client = boto3.client(
        "s3",
        endpoint_url=os.environ.get("S3_ENDPOINT"),
        region_name=os.environ.get("S3_REGION", "us-east-1"),
        aws_access_key_id=os.environ.get("S3_ACCESS_KEY", ""),
        aws_secret_access_key=os.environ.get("S3_SECRET_KEY", ""),
    )
    store = ObjectStore(s3_client)

    # Conexão RabbitMQ
    amqp_url = os.environ.get("AMQP_URL", "amqp://guest:guest@localhost:5672/")
    connection = pika.BlockingConnection(pika.URLParameters(amqp_url))
    channel = connection.channel()

    # Warm-up antes de registrar consumidor (D18)
    warmup_models()

    # Importações tardias para evitar circular imports no esqueleto
    from forecast_engine.application.dataset_reader import DatasetReader
    from forecast_engine.application.result_writer import ResultWriter

    reader = DatasetReader(store)
    writer = ResultWriter(store)

    consumer = ForecastConsumer(channel, store, reader, writer)

    logger.info("motor pronto — iniciando consumo")
    try:
        consumer.start()
    finally:
        connection.close()


if __name__ == "__main__":
    main()
