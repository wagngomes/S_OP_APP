# syntax=docker/dockerfile:1
# ================================================================
# services/forecast-engine — multi-stage python:3.12-slim
# Build context: repo root
# D4: Debian slim (não Alpine) — numba/llvmlite sem wheels musllinux estáveis
# D18: NUMBA_CACHE_DIR persistido em volume; warm-up no boot (T059)
# T034
# ================================================================

FROM python:3.12-slim AS builder
WORKDIR /build

# Dependências de compilação (numba compila extensões C no install)
RUN apt-get update \
 && apt-get install -y --no-install-recommends gcc g++ \
 && rm -rf /var/lib/apt/lists/*

RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# 1. Instalar dependências de produção (layer de cache: invalida só com pyproject.toml)
COPY services/forecast-engine/pyproject.toml ./
RUN python - <<'DEPS'
import tomllib, subprocess, sys
with open('pyproject.toml', 'rb') as f:
    deps = tomllib.load(f)['project']['dependencies']
subprocess.run([sys.executable, '-m', 'pip', 'install', '--no-cache-dir'] + deps, check=True)
DEPS

# 2. Instalar o pacote sem reinstalar as deps já presentes
COPY services/forecast-engine/src ./src
RUN pip install --no-cache-dir --no-deps .

# ─── runner: imagem final mínima ─────────────────────────────────
FROM python:3.12-slim AS runner
WORKDIR /app

RUN groupadd --system --gid 1001 engine \
 && useradd  --system --uid 1001 --gid 1001 engine

COPY --from=builder /opt/venv /opt/venv

# Diretório de cache do numba — montado como volume para persistir entre restarts
RUN mkdir -p /app/.numba_cache && chown engine:engine /app/.numba_cache

USER engine

ENV PATH="/opt/venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    NUMBA_CACHE_DIR=/app/.numba_cache

EXPOSE 9102

CMD ["python", "-m", "forecast_engine.main"]
