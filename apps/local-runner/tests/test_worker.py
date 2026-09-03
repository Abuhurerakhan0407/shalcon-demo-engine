from __future__ import annotations

from threading import Event
from typing import Any

from shalcon_runner.client import ClaimedJob
from shalcon_runner.research import ResearchJobError
from shalcon_runner.worker import LocalRunnerWorker


class FakeClient:
    def __init__(self, job: ClaimedJob | None) -> None:
        self.job = job
        self.heartbeats: list[tuple[str, list[str]]] = []
        self.renewed: list[str] = []
        self.renew_event = Event()
        self.completed: list[tuple[str, Any]] = []
        self.research_completed: list[tuple[str, Any]] = []
        self.failed: list[tuple[str, str, str]] = []

    def heartbeat(self, version: str, capabilities: list[str]) -> dict[str, Any]:
        self.heartbeats.append((version, capabilities))
        return {}

    def claim(self) -> ClaimedJob | None:
        job, self.job = self.job, None
        return job

    def renew(self, job_id: str) -> dict[str, Any]:
        self.renewed.append(job_id)
        self.renew_event.set()
        return {}

    def complete(self, job_id: str, result: Any) -> dict[str, Any]:
        self.completed.append((job_id, result))
        return {}

    def complete_research(self, job_id: str, result: Any) -> dict[str, Any]:
        self.research_completed.append((job_id, result))
        return {}

    def fail(self, job_id: str, error_code: str, safe_message: str) -> dict[str, Any]:
        self.failed.append((job_id, error_code, safe_message))
        return {}


def job(job_type: str = "PHASE8_ECHO", lease_seconds: int = 120) -> ClaimedJob:
    return ClaimedJob(
        id="job_test",
        job_type=job_type,
        entity_id="entity_1",
        attempts=0,
        max_attempts=3,
        lease_seconds=lease_seconds,
        payload={"hello": "world"},
    )


def test_idle_poll_still_heartbeats() -> None:
    client = FakeClient(None)
    outcome = LocalRunnerWorker(client).run_once()  # type: ignore[arg-type]
    assert outcome.status == "IDLE"
    assert len(client.heartbeats) == 1
    assert client.completed == []
    assert client.failed == []


def test_echo_job_completes_with_result() -> None:
    client = FakeClient(job())
    outcome = LocalRunnerWorker(client).run_once()  # type: ignore[arg-type]
    assert outcome.status == "COMPLETED"
    assert outcome.job_id == "job_test"
    assert client.failed == []
    assert client.completed[0][0] == "job_test"
    assert client.completed[0][1]["payload"] == {"hello": "world"}
    assert client.research_completed == []


def test_long_job_renews_lease_while_handler_is_running() -> None:
    client = FakeClient(job(lease_seconds=1))

    def slow_handler(_: ClaimedJob) -> dict[str, bool]:
        assert client.renew_event.wait(timeout=2.0)
        return {"ok": True}

    outcome = LocalRunnerWorker(
        client,
        handlers={"PHASE8_ECHO": slow_handler},
    ).run_once()  # type: ignore[arg-type]

    assert outcome.status == "COMPLETED"
    assert client.renewed
    assert client.completed == [("job_test", {"ok": True})]


def test_research_job_uses_validated_cloud_completion_path() -> None:
    client = FakeClient(job("PLAYWRIGHT_RESEARCH"))

    def research_fixture(_: ClaimedJob) -> dict[str, Any]:
        return {"schemaVersion": "playwright-research.v1", "sourceOnly": True}

    outcome = LocalRunnerWorker(
        client,
        handlers={"PLAYWRIGHT_RESEARCH": research_fixture},
    ).run_once()  # type: ignore[arg-type]
    assert outcome.status == "COMPLETED"
    assert client.completed == []
    assert client.research_completed == [
        ("job_test", {"schemaVersion": "playwright-research.v1", "sourceOnly": True})
    ]


def test_research_policy_failure_preserves_specific_safe_error_code() -> None:
    client = FakeClient(job("PLAYWRIGHT_RESEARCH"))

    def blocked(_: ClaimedJob) -> Any:
        raise ResearchJobError("UNSAFE_RESEARCH_URL", "Research URL failed policy.")

    outcome = LocalRunnerWorker(
        client,
        handlers={"PLAYWRIGHT_RESEARCH": blocked},
    ).run_once()  # type: ignore[arg-type]
    assert outcome.status == "FAILED"
    assert client.research_completed == []
    assert client.failed == [
        ("job_test", "UNSAFE_RESEARCH_URL", "Research URL failed policy.")
    ]


def test_unknown_job_type_fails_closed() -> None:
    client = FakeClient(job("ARBITRARY_CODE"))
    outcome = LocalRunnerWorker(client).run_once()  # type: ignore[arg-type]
    assert outcome.status == "FAILED"
    assert client.completed == []
    assert client.failed[0][1] == "UNSUPPORTED_JOB_TYPE"


def test_handler_exception_is_sanitized() -> None:
    client = FakeClient(job("FAIL_TEST"))

    def boom(_: ClaimedJob) -> Any:
        raise RuntimeError("secret internal detail")

    outcome = LocalRunnerWorker(client, handlers={"FAIL_TEST": boom}).run_once()  # type: ignore[arg-type]
    assert outcome.status == "FAILED"
    assert client.failed[0][1] == "LOCAL_EXECUTION_FAILED"
    assert "secret internal detail" not in client.failed[0][2]
