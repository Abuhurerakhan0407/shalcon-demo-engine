from __future__ import annotations

from dataclasses import dataclass
import ipaddress
import json
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener


class RunnerApiError(RuntimeError):
    """Safe runner API error that never embeds bearer credentials."""


class _NoRedirect(HTTPRedirectHandler):
    """Runner control-plane requests must never forward bearer credentials through redirects."""

    def redirect_request(self, req: Any, fp: Any, code: int, msg: str, headers: Any, newurl: str) -> None:
        return None


def _loopback_host(hostname: str) -> bool:
    normalized = hostname.strip().rstrip(".").lower()
    if normalized == "localhost" or normalized.endswith(".localhost"):
        return True
    try:
        return ipaddress.ip_address(normalized).is_loopback
    except ValueError:
        return False


def _validated_base_url(raw_base_url: str) -> str:
    candidate = raw_base_url.strip()
    try:
        parsed = urlsplit(candidate)
        parsed.port
    except ValueError as exc:
        raise ValueError("Runner API base URL is malformed.") from exc

    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise ValueError("Runner API base URL must use http:// or https://.")
    if parsed.username or parsed.password:
        raise ValueError("Runner API base URL must not contain credentials.")
    if parsed.query or parsed.fragment:
        raise ValueError("Runner API base URL must not contain query or fragment data.")
    if parsed.path not in {"", "/"}:
        raise ValueError("Runner API base URL must not contain an application path.")
    if parsed.scheme == "http" and not _loopback_host(parsed.hostname):
        raise ValueError("Runner API requires HTTPS except for loopback development endpoints.")

    return candidate.rstrip("/")


def _strict_string(value: Any, field: str, max_length: int) -> str:
    if not isinstance(value, str) or not value or len(value) > max_length:
        raise RunnerApiError(f"Claim response contained invalid {field}.")
    return value


def _strict_int(value: Any, field: str, minimum: int, maximum: int) -> int:
    if type(value) is not int or value < minimum or value > maximum:
        raise RunnerApiError(f"Claim response contained invalid {field}.")
    return value


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
        base = _validated_base_url(base_url)
        if len(token.strip()) < 24:
            raise ValueError("Runner token is missing or too short.")
        self._base_url = base
        self._token = token.strip()
        self._timeout_seconds = timeout_seconds
        self._opener = build_opener(_NoRedirect())

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
            with self._opener.open(request, timeout=self._timeout_seconds) as response:  # noqa: S310 - base URL passed strict transport validation and redirects are disabled.
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

        job_id = _strict_string(raw_job.get("id"), "job id", 160)
        job_type = _strict_string(raw_job.get("jobType"), "job type", 80)
        entity_id = _strict_string(raw_job.get("entityId"), "entity id", 160)
        attempts = _strict_int(raw_job.get("attempts"), "attempt count", 0, 10)
        max_attempts = _strict_int(raw_job.get("maxAttempts"), "max attempts", 1, 10)
        if attempts > max_attempts:
            raise RunnerApiError("Claim response contained an invalid attempt count.")
        lease_seconds = _strict_int(response.get("leaseSeconds"), "lease duration", 1, 3600)

        return ClaimedJob(
            id=job_id,
            job_type=job_type,
            entity_id=entity_id,
            attempts=attempts,
            max_attempts=max_attempts,
            lease_seconds=lease_seconds,
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

    def complete_ai(self, job_id: str, result: Any) -> dict[str, Any]:
        return self._request(
            "POST",
            f"/api/v1/runner/ai/jobs/{job_id}/complete",
            {"result": result},
        )

    def fail(self, job_id: str, error_code: str, safe_message: str) -> dict[str, Any]:
        return self._request(
            "POST",
            f"/api/v1/runner/agent/jobs/{job_id}/fail",
            {"errorCode": error_code[:80], "safeMessage": safe_message[:500]},
        )
