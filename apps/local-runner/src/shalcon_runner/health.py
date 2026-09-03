from __future__ import annotations

from dataclasses import asdict, dataclass
import platform

from . import __version__


@dataclass(frozen=True)
class RunnerHealth:
    ok: bool
    service: str
    version: str
    python: str
    phase: int
    mode: str


def get_health() -> RunnerHealth:
    return RunnerHealth(
        ok=True,
        service="shalcon-local-runner",
        version=__version__,
        python=platform.python_version(),
        phase=0,
        mode="foundation",
    )


def health_dict() -> dict[str, object]:
    return asdict(get_health())
