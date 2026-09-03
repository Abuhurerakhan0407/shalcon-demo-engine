from __future__ import annotations

from collections.abc import Callable, Iterable
import ipaddress
import socket
from urllib.parse import urlsplit, urlunsplit

Resolver = Callable[..., Iterable[tuple[object, ...]]]


class UnsafeResearchUrl(ValueError):
    """Raised when a browser research URL is not safe for public-web navigation."""


_BLOCKED_HOST_SUFFIXES = (".localhost", ".local", ".internal")
_ALLOWED_SCHEMES = {"http", "https"}
_MAX_URL_LENGTH = 2048


def _resolved_ips(hostname: str, port: int, resolver: Resolver) -> list[ipaddress.IPv4Address | ipaddress.IPv6Address]:
    try:
        answers = resolver(hostname, port, type=socket.SOCK_STREAM)
    except OSError as exc:
        raise UnsafeResearchUrl("Research hostname could not be resolved safely.") from exc

    ips: list[ipaddress.IPv4Address | ipaddress.IPv6Address] = []
    for answer in answers:
        if len(answer) < 5:
            continue
        sockaddr = answer[4]
        if not isinstance(sockaddr, tuple) or not sockaddr:
            continue
        raw_ip = str(sockaddr[0]).split("%", 1)[0]
        try:
            ips.append(ipaddress.ip_address(raw_ip))
        except ValueError:
            continue
    if not ips:
        raise UnsafeResearchUrl("Research hostname did not resolve to a usable public address.")
    return ips


def validate_public_http_url(raw_url: str, resolver: Resolver = socket.getaddrinfo) -> str:
    """Normalize and validate one navigation URL against the SSRF policy.

    Production research is public-web only. Every resolved address must be globally routable;
    mixed public/private DNS answers are rejected instead of choosing the public answer.
    """

    candidate = raw_url.strip()
    if not candidate or len(candidate) > _MAX_URL_LENGTH:
        raise UnsafeResearchUrl("Research URL is missing or too long.")

    try:
        parsed = urlsplit(candidate)
    except ValueError as exc:
        raise UnsafeResearchUrl("Research URL is malformed.") from exc

    scheme = parsed.scheme.lower()
    if scheme not in _ALLOWED_SCHEMES:
        raise UnsafeResearchUrl("Research URL must use http:// or https://.")
    if parsed.username is not None or parsed.password is not None:
        raise UnsafeResearchUrl("Research URL must not contain embedded credentials.")
    if not parsed.hostname:
        raise UnsafeResearchUrl("Research URL must contain a hostname.")

    hostname = parsed.hostname.rstrip(".").lower()
    if (
        hostname == "localhost"
        or hostname.endswith(_BLOCKED_HOST_SUFFIXES)
        or "%" in hostname
    ):
        raise UnsafeResearchUrl("Research hostname is not allowed.")

    try:
        port = parsed.port or (443 if scheme == "https" else 80)
    except ValueError as exc:
        raise UnsafeResearchUrl("Research URL contains an invalid port.") from exc
    if port < 1 or port > 65535:
        raise UnsafeResearchUrl("Research URL contains an invalid port.")

    try:
        literal_ip = ipaddress.ip_address(hostname)
    except ValueError:
        addresses = _resolved_ips(hostname, port, resolver)
    else:
        addresses = [literal_ip]

    if any(not address.is_global for address in addresses):
        raise UnsafeResearchUrl("Research URL resolved to a non-public network address.")

    normalized_netloc = hostname
    if ":" in hostname and not hostname.startswith("["):
        normalized_netloc = f"[{hostname}]"
    default_port = 443 if scheme == "https" else 80
    if port != default_port:
        normalized_netloc = f"{normalized_netloc}:{port}"

    path = parsed.path or "/"
    return urlunsplit((scheme, normalized_netloc, path, parsed.query, ""))
