"""
Adaptador MinIO/S3 do motor de previsão (D5, D18).

URIs seguem o formato s3://bucket/key/path conforme contracts/messaging.md.
O motor lê datasets em Parquet, grava resultados em Parquet e escreve o
marcador _SUCCESS após concluir — garantindo que a idempotência (D6) não
republique um resultado escrito pela metade.
"""

from __future__ import annotations

from io import BytesIO
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from mypy_boto3_s3 import S3Client
else:
    S3Client = object


def _parse_uri(uri: str) -> tuple[str, str]:
    """Parse s3://bucket/key para (bucket, key)."""
    if not uri.startswith("s3://"):
        raise ValueError(f"URI inválida (esperado s3://): {uri!r}")
    without_scheme = uri[5:]
    slash = without_scheme.index("/")
    bucket = without_scheme[:slash]
    key = without_scheme[slash + 1 :]
    return bucket, key


class ObjectStore:
    """Acesso ao MinIO/S3 para o motor de previsão."""

    def __init__(self, client: S3Client) -> None:
        self._client = client

    # ─── Leitura ──────────────────────────────────────────────────

    def get_bytes(self, uri: str) -> bytes:
        """Baixa o objeto completo como bytes."""
        bucket, key = _parse_uri(uri)
        response = self._client.get_object(Bucket=bucket, Key=key)
        return response["Body"].read()

    # ─── Escrita ──────────────────────────────────────────────────

    def put_bytes(self, uri: str, data: bytes) -> None:
        """Envia bytes para o MinIO."""
        bucket, key = _parse_uri(uri)
        self._client.put_object(Bucket=bucket, Key=key, Body=data)

    def write_success_marker(self, output_prefix: str) -> None:
        """
        Grava o marcador _SUCCESS após escrever os Parquets (D18).

        Deve ser chamado por último, só após output.parquet e series.parquet
        estarem persistidos. A idempotência verifica este objeto antes de
        recalcular (D6) — se ele existe, republica o resultado em vez de
        recalcular.
        """
        sep = "" if output_prefix.endswith("/") else "/"
        self.put_bytes(f"{output_prefix}{sep}_SUCCESS", b"")

    # ─── Verificação de conclusão ──────────────────────────────────

    def is_complete(self, output_prefix: str) -> bool:
        """Verifica se o marcador _SUCCESS existe (idempotência D6)."""
        sep = "" if output_prefix.endswith("/") else "/"
        bucket, key = _parse_uri(f"{output_prefix}{sep}_SUCCESS")
        try:
            self._client.head_object(Bucket=bucket, Key=key)
            return True
        except self._client.exceptions.ClientError as exc:
            code = exc.response["Error"]["Code"]  # type: ignore[attr-defined]
            if code in ("404", "NoSuchKey"):
                return False
            raise
