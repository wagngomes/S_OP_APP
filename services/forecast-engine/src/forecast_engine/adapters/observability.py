"""
Observabilidade do motor de previsão (Princípio IX).

Dois subsistemas:
  - Logs JSON via structlog — cada linha carrega level, timestamp ISO e
    os campos contextuais do job (correlationId, scenarioId, etc.)
  - Métricas Prometheus via HTTP em ENGINE_METRICS_PORT (padrão 9102) —
    scrapeado pelo Prometheus conforme infra/prometheus/prometheus.yml

Chamada esperada no boot (antes de processar qualquer mensagem):
    configure_logging()
    configure_metrics()
"""

from __future__ import annotations

import logging
import os

import structlog
from prometheus_client import CollectorRegistry, Counter, Histogram, start_http_server

# ─── Registry próprio ─────────────────────────────────────────────
# Evita colisão com o REGISTRY global em testes que sobem múltiplas
# instâncias do módulo.
registry = CollectorRegistry(auto_describe=True)

jobs_total = Counter(
    "sop_forecast_jobs_total",
    "Jobs de previsão por desfecho",
    ["outcome"],          # success | failure
    registry=registry,
)

job_duration_seconds = Histogram(
    "sop_forecast_job_duration_seconds",
    "Duração do job de previsão fim-a-fim",
    buckets=[1, 5, 15, 30, 60, 120, 300],
    registry=registry,
)

rows_processed_total = Counter(
    "sop_forecast_rows_processed_total",
    "Linhas do dataset lidas pelo motor",
    registry=registry,
)


# ─── Logging ──────────────────────────────────────────────────────

def configure_logging(level: str | None = None) -> None:
    """Configura structlog para emitir JSON estruturado no stdout."""
    log_level = (level or os.environ.get("LOG_LEVEL", "INFO")).upper()

    logging.basicConfig(
        format="%(message)s",
        level=getattr(logging, log_level, logging.INFO),
    )

    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.stdlib.add_log_level,
            structlog.stdlib.add_logger_name,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.JSONRenderer(),
        ],
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )


# ─── Métricas ─────────────────────────────────────────────────────

def configure_metrics(port: int | None = None) -> None:
    """Inicia o servidor HTTP de métricas Prometheus."""
    metrics_port = port or int(os.environ.get("ENGINE_METRICS_PORT", "9102"))
    start_http_server(metrics_port, registry=registry)
