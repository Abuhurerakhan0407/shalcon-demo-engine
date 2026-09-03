from __future__ import annotations

from dataclasses import dataclass
import time
from typing import Any, Callable

from . import __version__
from .client import ClaimedJob, RunnerApiClient, RunnerApiError
from .research import ResearchJobError, research_job

JobHandler = Callable[[ClaimedJob], Any]


@dataclass(frozen=True)
class RunOutcome:
    status: str
    job_id: str | None = None
    job_type: str | None = None


def _echo(job: ClaimedJob) -> dict[str, Any]:
    return {
        "ok": True,
        "jobId": job.id,
        "jobType": job.job_type,
        "entityId": job.entity_id,
        "payload": job.payload,
    }


DEFAULT_HANDLERS: dict[str, JobHandler] = {
    "PHASE8_ECHO": _echo,
    "PLAYWRIGHT_RESEARCH": research_job,
}


def safe_exception_message(error: BaseException) -> str:
    if isinstance(error, RunnerApiError):
        return str(error)[:500]
    return f"{type(error).__name__}: local job execution failed safely."[:500]


class LocalRunnerWorker:
    def __init__(
        self,
        client: RunnerApiClient,
        handlers: dict[str, JobHandler] | None = None,
        capabilities: list[str] | None = None,
    ) -> None:
        self.client = client
        self.handlers = dict(DEFAULT_HANDLERS if handlers is None else handlers)
        self.capabilities = capabilities or sorted(self.handlers)

    def heartbeat(self) -> None:
        self.client.heartbeat(__version__, self.capabilities)

    def run_once(self) -> RunOutcome:
        self.heartbeat()
        job = self.client.claim()
        if job is None:
            return RunOutcome(status="IDLE")

        handler = self.handlers.get(job.job_type)
        if handler is None:
            self.client.fail(
                job.id,
                "UNSUPPORTED_JOB_TYPE",
                f"Runner does not support job type {job.job_type!r}.",
            )
            return RunOutcome(status="FAILED", job_id=job.id, job_type=job.job_type)

        try:
            result = handler(job)
        except ResearchJobError as error:
            self.client.fail(job.id, error.code, error.safe_message)
            return RunOutcome(status="FAILED", job_id=job.id, job_type=job.job_type)
        except BaseException as error:  # noqa: BLE001 - boundary converts arbitrary handler faults to a safe failure.
            self.client.fail(job.id, "LOCAL_EXECUTION_FAILED", safe_exception_message(error))
            return RunOutcome(status="FAILED", job_id=job.id, job_type=job.job_type)

        if job.job_type == "PLAYWRIGHT_RESEARCH":
            self.client.complete_research(job.id, result)
        else:
            self.client.complete(job.id, result)
        return RunOutcome(status="COMPLETED", job_id=job.id, job_type=job.job_type)

    def run_forever(self, poll_seconds: float = 3.0) -> None:
        delay = max(1.0, poll_seconds)
        while True:
            try:
                outcome = self.run_once()
                if outcome.status == "IDLE":
                    time.sleep(delay)
            except RunnerApiError:
                time.sleep(min(30.0, delay * 2))
