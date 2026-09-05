"""
Limitação de n_jobs pelo CPU quota do contêiner (D18).

Num contêiner com quota de CPU, os.cpu_count() devolve o total do host — não
o limite real alocado para o contêiner. Usar esse valor excessivo causa
thrashing de threads e degrada o throughput.

Lógica de detecção (cgroups v2, padrão Docker moderno):
  /sys/fs/cgroup/cpu.max contém "<quota> <period>"; se quota == "max" não há
  limite e devolvemos os.cpu_count(). Caso contrário: ceil(quota / period).

Fallback silencioso para cgroups v1 (quota em cpu/cpu.cfs_quota_us) e, se
nenhum arquivo existir, usa os.cpu_count() sem aviso.
"""

from __future__ import annotations

import math
import os
from pathlib import Path


_CGROUP_V2_CPU_MAX = Path("/sys/fs/cgroup/cpu.max")
_CGROUP_V1_QUOTA = Path("/sys/fs/cgroup/cpu/cpu.cfs_quota_us")
_CGROUP_V1_PERIOD = Path("/sys/fs/cgroup/cpu/cpu.cfs_period_us")


def _host_cpus() -> int:
    return os.cpu_count() or 1


def container_cpu_limit() -> int:
    """Número de CPUs disponíveis para este processo dentro do contêiner.

    Lê o quota cgroup para não over-subscribe a thread pool. Nunca retorna 0.
    """
    # cgroups v2
    if _CGROUP_V2_CPU_MAX.exists():
        try:
            quota_str, period_str = _CGROUP_V2_CPU_MAX.read_text().split()
            if quota_str == "max":
                return _host_cpus()
            return max(1, math.ceil(int(quota_str) / int(period_str)))
        except (ValueError, OSError):
            pass

    # cgroups v1
    if _CGROUP_V1_QUOTA.exists() and _CGROUP_V1_PERIOD.exists():
        try:
            quota = int(_CGROUP_V1_QUOTA.read_text())
            period = int(_CGROUP_V1_PERIOD.read_text())
            if quota > 0:
                return max(1, math.ceil(quota / period))
        except (ValueError, OSError):
            pass

    return _host_cpus()


def safe_n_jobs() -> int:
    """n_jobs para StatisticalForecast: limitado pelo CPU quota do contêiner.

    Usar -1 (todos os cores) numa máquina com cgroups causa over-subscription.
    Este valor garante que o pool de threads não exceda o limite real do contêiner.
    """
    return container_cpu_limit()
