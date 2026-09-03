from __future__ import annotations

from dataclasses import dataclass
from threading import Event, Thread
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


class _LeaseKeeper:
    def __init__(self, client: RunnerApiClient, job: ClaimedJob) -> None:
        self.client = client
        self.job = job
        self.interval_seconds = max(0.25, min(float(job.lease_seconds) / 3.0, 30.0))
        self._stop = Event()
        self._thread = Thread(target=self._run, daemon=True, name=f"lease-{job.id[:32]}")
        self.last_error: RunnerApiError | None = None

    def start(self) -> None:
        self._thread.start()

    def _run(self) -> None:
        while not self._stop.wait(self.interval_seconds):
            try:
                self.client.renew(self.job.id)
            except RunnerApiError as error:
                self.last_error = error
            except BaseException:  # noqa: BLE001 - renewal thread must fail closed.
                self.last_error = RunnerApiError("Lease renewal failed safely.")
            else:
                self.last_error = None

    def stop(self) -> None:
        self._stop.set()
        self._thread.join(timeout=5.0)
        if self._thread.is_alive():
            raise RunnerApiError("Lease renewal did not stop safely.")

    def ensure_current(self) -> None:
        # Always renew once synchronously immediately before the terminal API call. This gives
        # result persistence/failure handling a fresh lease window and proves the runner still
        # owns the job after any long browser execution or transient background-renewal error.
        self.client.renew(self.job.id)
        self.last_error = None


class LocalRunnerWorker:
    def __init__(
        self,
        client: RunnerApiClient,
        handlers: dict[str, JobHandler] | None = None,
        capabilities: list[str] | None = None,
    ) -> None:
        self.client = client
        self.handlers = dict(DEFAULT_HANDLERS if handlers is None else handlers)
        if capabilities is None:
            self.capabilities = sorted(self.handlers)
        else:
            # Never advertise a job type this process cannot actually execute. Explicit capability
            # lists can narrow the runner, but cannot make the control plane hand it unknown work.
            self.capabilities = sorted(set(capabilities).intersection(self.handlers))

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

        lease_keeper = _LeaseKeeper(self.client, job)
        lease_keeper.start()
        try:
            try:
                result = handler(job)
            except ResearchJobError as error:
                lease_keeper.stop()
                lease_keeper.ensure_current()
                self.client.fail(job.id, error.code, error.safe_message)
                return RunOutcome(status="FAILED", job_id=job.id, job_type=job.job_type)
            except BaseException as error:  # noqa: BLE001 - boundary sanitizes arbitrary faults.
                lease_keeper.stop()
                lease_keeper.ensure_current()
                self.client.fail(job.id, "LOCAL_EXECUTION_FAILED", safe_exception_message(error))
                return RunOutcome(status="FAILED", job_id=job.id, job_type=job.job_type)

            lease_keeper.stop()
            lease_keeper.ensure_current()
            if job.job_type == "PLAYWRIGHT_RESEARCH":
                self.client.complete_research(job.id, result)
            else:
                self.client.complete(job.id, result)
            return RunOutcome(status="COMPLETED", job_id=job.id, job_type=job.job_type)
        finally:
            lease_keeper.stop()

    def run_forever(self, poll_seconds: float = 3.0) -> None:
        delay = max(1.0, poll_seconds)
        while True:
            try:
                outcome = self.run_once()
                if outcome.status == "IDLE":
                    time.sleep(delay)
            except RunnerApiError:
                time.sleep(min(30.0, delay * 2))
