from __future__ import annotations

import socket
import struct

import pytest

from shalcon_runner.egress_proxy import (
    PublicSocksProxy,
    UnsafeEgressTarget,
    resolve_public_target,
)


def resolver_for(*addresses: str):
    def resolve(host: str, port: int, *, type: int):
        assert type == socket.SOCK_STREAM
        return [
            (
                socket.AF_INET6 if ":" in address else socket.AF_INET,
                socket.SOCK_STREAM,
                6,
                "",
                (address, port),
            )
            for address in addresses
        ]

    return resolve


def test_public_target_is_resolved_to_exact_public_ip() -> None:
    targets = resolve_public_target(
        "Example.COM",
        443,
        resolver=resolver_for("93.184.216.34"),
    )
    assert targets == [(socket.AF_INET, "93.184.216.34")]


@pytest.mark.parametrize(
    ("host", "port"),
    [
        ("127.0.0.1", 80),
        ("169.254.169.254", 80),
        ("::1", 443),
        ("localhost", 80),
        ("service.internal", 443),
        ("example.com", 8080),
    ],
)
def test_private_internal_or_non_web_targets_are_rejected(host: str, port: int) -> None:
    with pytest.raises(UnsafeEgressTarget):
        resolve_public_target(host, port, resolver=resolver_for("93.184.216.34"))


def test_mixed_public_private_dns_answer_is_rejected() -> None:
    with pytest.raises(UnsafeEgressTarget):
        resolve_public_target(
            "example.com",
            443,
            resolver=resolver_for("93.184.216.34", "10.0.0.7"),
        )


def test_socks_proxy_rejects_loopback_connect() -> None:
    with PublicSocksProxy() as proxy_url:
        host, raw_port = proxy_url.removeprefix("socks5://").rsplit(":", 1)
        client = socket.create_connection((host, int(raw_port)), timeout=2)
        try:
            client.sendall(b"\x05\x01\x00")
            assert client.recv(2) == b"\x05\x00"

            client.sendall(
                b"\x05\x01\x00\x01"
                + socket.inet_aton("127.0.0.1")
                + struct.pack("!H", 80)
            )
            response = client.recv(10)
            assert response[:2] == b"\x05\x02"
        finally:
            client.close()
