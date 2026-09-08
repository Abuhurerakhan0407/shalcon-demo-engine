from __future__ import annotations

from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from threading import Thread
from typing import Any

import pytest

from shalcon_runner.client import RunnerApiClient, RunnerApiError


TOKEN = "runner-test-token-that-is-long-enough"


@pytest.mark.parametrize(
    "base_url",
    [
        "http://api.example.com",
        "http://192.0.2.10:8787",
        "ftp://api.example.com",
        "https://user:pass@api.example.com",
        "https://api.example.com/worker",
        "https://api.example.com?mode=runner",
        "https://api.example.com#runner",
        "https://api.example.com:99999",
        "https://api.example.com:not-a-port",
    ],
)
def test_insecure_or_ambiguous_runner_api_base_urls_are_rejected(base_url: str) -> None:
    with pytest.raises(ValueError):
        RunnerApiClient(base_url, TOKEN)


@pytest.mark.parametrize(
    "base_url",
    [
        "https://api.example.com",
        "https://api.example.com:443",
        "http://localhost:8787",
        "http://127.0.0.1:8787",
        "http://[::1]:8787",
    ],
)
def test_https_or_loopback_development_runner_api_urls_are_accepted(base_url: str) -> None:
    client = RunnerApiClient(base_url, TOKEN)
    assert client._base_url == base_url.rstrip("/")


def test_runner_token_minimum_length_still_applies_after_transport_validation() -> None:
    with pytest.raises(ValueError, match="token"):
        RunnerApiClient("https://api.example.com", "too-short")


def test_runner_api_redirects_are_not_followed_or_given_bearer_credentials() -> None:
    requests: list[tuple[str, str | None]] = []

    class RedirectHandler(BaseHTTPRequestHandler):
        def do_POST(self) -> None:  # noqa: N802 - stdlib handler API.
            requests.append((self.path, self.headers.get("Authorization")))
            if self.path == "/api/v1/runner/agent/heartbeat":
                self.send_response(302)
                self.send_header("Location", "/redirect-target")
                self.end_headers()
                return
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(b"{}")

        def log_message(self, format: str, *args: Any) -> None:
            return

    server = ThreadingHTTPServer(("127.0.0.1", 0), RedirectHandler)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        client = RunnerApiClient(f"http://127.0.0.1:{server.server_port}", TOKEN)
        with pytest.raises(RunnerApiError, match="HTTP 302"):
            client.heartbeat("0.1.0", ["PLAYWRIGHT_RESEARCH"])
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2.0)

    assert requests == [
        ("/api/v1/runner/agent/heartbeat", f"Bearer {TOKEN}"),
    ]


def test_ai_completion_uses_dedicated_cloud_validation_route() -> None:
    received: list[tuple[str, dict[str, Any], str | None]] = []

    class Handler(BaseHTTPRequestHandler):
        def do_POST(self) -> None:  # noqa: N802 - stdlib handler API.
            length = int(self.headers.get("Content-Length", "0"))
            body = json.loads(self.rfile.read(length).decode("utf-8"))
            received.append((self.path, body, self.headers.get("Authorization")))
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(b'{"ok":true}')

        def log_message(self, format: str, *args: Any) -> None:
            return

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        client = RunnerApiClient(f"http://127.0.0.1:{server.server_port}", TOKEN)
        client.complete_ai("job_ai", {"schemaVersion": "business-extraction.v1"})
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2.0)

    assert received == [
        (
            "/api/v1/runner/ai/jobs/job_ai/complete",
            {"result": {"schemaVersion": "business-extraction.v1"}},
            f"Bearer {TOKEN}",
        )
    ]
