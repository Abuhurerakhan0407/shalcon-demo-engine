from __future__ import annotations

import pytest

from shalcon_runner.client import RunnerApiClient


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
