from __future__ import annotations

from typing import Any

import pytest

from shalcon_runner.client import RunnerApiClient, RunnerApiError


TOKEN = "runner-test-token-that-is-long-enough"


def client_with_claim_response(monkeypatch: pytest.MonkeyPatch, response: dict[str, Any]) -> RunnerApiClient:
    client = RunnerApiClient("https://api.example.com", TOKEN)
    monkeypatch.setattr(client, "_request", lambda *args, **kwargs: response)
    return client


def valid_response() -> dict[str, Any]:
    return {
        "job": {
            "id": "job_claim_fixture",
            "jobType": "PLAYWRIGHT_RESEARCH",
            "entityId": "prospect_fixture",
            "attempts": 0,
            "maxAttempts": 3,
        },
        "payload": {"url": "https://example.com/"},
        "leaseSeconds": 120,
    }


def test_claim_accepts_exact_expected_types(monkeypatch: pytest.MonkeyPatch) -> None:
    claimed = client_with_claim_response(monkeypatch, valid_response()).claim()
    assert claimed is not None
    assert claimed.id == "job_claim_fixture"
    assert claimed.job_type == "PLAYWRIGHT_RESEARCH"
    assert claimed.entity_id == "prospect_fixture"
    assert claimed.attempts == 0
    assert claimed.max_attempts == 3
    assert claimed.lease_seconds == 120


@pytest.mark.parametrize(
    ("field", "bad_value"),
    [
        ("id", True),
        ("id", ""),
        ("jobType", 123),
        ("entityId", None),
        ("attempts", True),
        ("attempts", 1.5),
        ("attempts", "1"),
        ("attempts", -1),
        ("maxAttempts", False),
        ("maxAttempts", 0),
        ("maxAttempts", 11),
    ],
)
def test_claim_rejects_coercible_or_out_of_range_job_fields(
    monkeypatch: pytest.MonkeyPatch,
    field: str,
    bad_value: Any,
) -> None:
    response = valid_response()
    response["job"][field] = bad_value
    with pytest.raises(RunnerApiError, match="Claim response contained invalid"):
        client_with_claim_response(monkeypatch, response).claim()


@pytest.mark.parametrize("lease", [None, True, 1.5, "120", 0, 3601])
def test_claim_rejects_invalid_lease_duration(
    monkeypatch: pytest.MonkeyPatch,
    lease: Any,
) -> None:
    response = valid_response()
    response["leaseSeconds"] = lease
    with pytest.raises(RunnerApiError, match="lease duration"):
        client_with_claim_response(monkeypatch, response).claim()


def test_claim_rejects_attempt_count_above_maximum(monkeypatch: pytest.MonkeyPatch) -> None:
    response = valid_response()
    response["job"]["attempts"] = 4
    response["job"]["maxAttempts"] = 3
    with pytest.raises(RunnerApiError, match="attempt count"):
        client_with_claim_response(monkeypatch, response).claim()


def test_idle_claim_does_not_require_lease_metadata(monkeypatch: pytest.MonkeyPatch) -> None:
    assert client_with_claim_response(monkeypatch, {"job": None}).claim() is None
