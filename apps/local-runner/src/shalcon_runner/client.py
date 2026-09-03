from __future__ import annotations

from dataclasses import dataclass
import json
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


class RunnerApiError(RuntimeError):
    """Safe runner API error that never embeds bearer credentials."""


@dataclass(frozen=True)
class ClaimedJob:
    id: str
    job_type: str
    entity_id: str
    attempts: int
    max_attempts: int
    lease_seconds: int
    payload: Any


class RunnerApiClient:
    def __init__(self, base_url: str, token: str, timeout_seconds: float = 20.0) -> None:
        base = base_url.strip().rstrip("/")
        if not base.startswith(("http://", "https://")):
            raise ValueError("Runner API base URL must use http:// or https://.")
        if len(token.strip()) < 24:
            raise ValueError("Runner token is missing or too short.")
        self._base_url = base
        self._token = token.strip()
        self._timeout_seconds = timeout_seconds

    def _request(self, method: str, path: str, payload: Any | None = None) -> dict[str, Any]:
        body = None if payload is None else json.dumps(payload, separators=(",", ":")).encode("utf-8")
        request = Request(
            f"{self._base_url}{path}",
            data=body,
            method=method,
            headers={
                "Authorization": f"Bearer {self._token}",
                "Accept": "application/json",
                "Content-Type": "application/json",
                "User-Agent": "shalcon-local-runner/0.1.0",
            },
        )
        try:
            with urlopen(request, timeout=self._timeout_seconds) as response:  # noqa: S310 - URL is operator-configured.
                raw = response.read().decode("utf-8")
        except HTTPError as exc:
            safe_message = f"Runner API returned HTTP {exc.code}."
            try:
                parsed = json.loads(exc.read().decode("utf-8"))
                message = parsed.get("error", {}).get("message")
                if isinstance(message, str) and message:
                    safe_message = message
            except (UnicodeDecodeError, json.JSONDecodeError, AttributeError):
                pass
            raise RunnerApiError(safe_message) from exc
        except (URLError, TimeoutError, OSError) as exc:
            raise RunnerApiError("Runner API is unreachable.") from exc

        if not raw:
            return {}
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise RunnerApiError("Runner API returned invalid JSON.") from exc
        if not isinstance(parsed, dict):
            raise RunnerApiError("Runner API returned an unexpected response shape.")
        return parsed

    def heartbeat(self, version: str, capabilities: list[str]) -> dict[str, Any]:
        return self._request(
            "POST",
            "/api/v1/runner/agent/heartbeat",
            {"version": version, "capabilities": capabilities},
        )

    def claim(self) -> ClaimedJob | None:
        response = self._request("POST", "/api/v1/runner/agent/jobs/claim", {})
        raw_job = response.get("job")
        if raw_job is None:
            return None
        if not isinstance(raw_job, dict):
            raise RunnerApiError("Claim response contained an invalid job.")
        required = ("id", "jobType", "entityId", "attempts", "maxAttempts")
        if any(key not in raw_job for key in required):
            raise RunnerApiError("Claim response is missing required job fields.")
        return ClaimedJob(
            id=str(raw_job["id"]),
            job_type=str(raw_job["jobType"]),
            entity_id=str(raw_job["entityId"]),
            attempts=int(raw_job["attempts"]),
            max_attempts=int(raw_job["maxAttempts"]),
            lease_seconds=int(response.get("leaseSeconds", 120)),
            payload=response.get("payload", {}),
        )

    def renew(self, job_id: str) -> dict[str, Any]:
        return self._request("POST", f"/api/v1/runner/agent/jobs/{job_id}/renew", {})

    def complete(self, job_id: str, result: Any) -> dict[str, Any]:
        return self._request("POST", f"/api/v1/runner/agent/jobs/{job_id}/complete", {"result": result})

    def complete_research(self, job_id: str, result: Any) -> dict[str, Any]:
        return self._request(
            "POST",
            f"/api/v1/runner/research/jobs/{job_id}/complete",
            {"result": result},
        )

    def fail(self, job_id: str, error_code: str, safe_message: str) -> dict[str, Any]:
        return self._request(
            "POST",
            f"/api/v1/runner/agent/jobs/{job_id}/fail",
            {"errorCode": error_code[:80], "safeMessage": safe_message[:500]},
        )
