from __future__ import annotations

import socket

import pytest

from shalcon_runner.url_safety import UnsafeResearchUrl, validate_public_http_url


def resolver_for(*addresses: str):
    def resolve(host: str, port: int, *, type: int):
        assert type == socket.SOCK_STREAM
        return [
            (socket.AF_INET6 if ":" in address else socket.AF_INET, socket.SOCK_STREAM, 6, "", (address, port))
            for address in addresses
        ]

    return resolve


def test_public_url_is_normalized_and_fragment_removed() -> None:
    normalized = validate_public_http_url(
        " HTTPS://Example.COM/salon?view=1#team ",
        resolver=resolver_for("93.184.216.34"),
    )
    assert normalized == "https://example.com/salon?view=1"


@pytest.mark.parametrize(
    "url",
    [
        "http://127.0.0.1/",
        "http://10.0.0.7/",
        "http://169.254.169.254/latest/meta-data/",
        "http://[::1]/",
        "http://localhost/",
        "http://service.internal/",
        "file:///etc/passwd",
        "ftp://example.com/file",
        "https://user:pass@example.com/",
    ],
)
def test_private_or_non_http_targets_are_rejected(url: str) -> None:
    with pytest.raises(UnsafeResearchUrl):
        validate_public_http_url(url, resolver=resolver_for("93.184.216.34"))


def test_mixed_public_private_dns_answer_is_rejected() -> None:
    with pytest.raises(UnsafeResearchUrl):
        validate_public_http_url(
            "https://example.com/",
            resolver=resolver_for("93.184.216.34", "10.10.0.9"),
        )


def test_unresolvable_hostname_is_rejected() -> None:
    def broken_resolver(host: str, port: int, *, type: int):
        raise socket.gaierror("fixture resolution failure")

    with pytest.raises(UnsafeResearchUrl):
        validate_public_http_url("https://does-not-resolve.example/", resolver=broken_resolver)
