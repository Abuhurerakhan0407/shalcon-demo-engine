from __future__ import annotations

from contextlib import AbstractContextManager
import ipaddress
import select
import socket
import socketserver
import struct
from threading import Thread
from typing import Callable, Iterable

Resolver = Callable[..., Iterable[tuple[object, ...]]]

_BLOCKED_HOST_SUFFIXES = (".localhost", ".local", ".internal")
_ALLOWED_WEB_PORTS = {80, 443}


class UnsafeEgressTarget(ValueError):
    """Raised when browser egress is not a public web destination."""


def resolve_public_target(
    hostname: str,
    port: int,
    resolver: Resolver = socket.getaddrinfo,
) -> list[tuple[int, str]]:
    if port not in _ALLOWED_WEB_PORTS:
        raise UnsafeEgressTarget("Browser egress is limited to standard web ports.")

    host = hostname.strip().rstrip(".").lower()
    if not host or host == "localhost" or host.endswith(_BLOCKED_HOST_SUFFIXES) or "%" in host:
        raise UnsafeEgressTarget("Browser egress hostname is not allowed.")

    try:
        host = host.encode("idna").decode("ascii")
    except UnicodeError as exc:
        raise UnsafeEgressTarget("Browser egress hostname is malformed.") from exc

    try:
        literal = ipaddress.ip_address(host)
    except ValueError:
        try:
            answers = resolver(host, port, type=socket.SOCK_STREAM)
        except OSError as exc:
            raise UnsafeEgressTarget("Browser egress hostname could not be resolved safely.") from exc

        candidates: list[tuple[int, str]] = []
        for answer in answers:
            if len(answer) < 5:
                continue
            family = answer[0]
            sockaddr = answer[4]
            if family not in {socket.AF_INET, socket.AF_INET6} or not isinstance(sockaddr, tuple) or not sockaddr:
                continue
            raw_ip = str(sockaddr[0]).split("%", 1)[0]
            try:
                address = ipaddress.ip_address(raw_ip)
            except ValueError:
                continue
            candidates.append((int(family), str(address)))
    else:
        family = socket.AF_INET6 if literal.version == 6 else socket.AF_INET
        candidates = [(family, str(literal))]

    if not candidates:
        raise UnsafeEgressTarget("Browser egress hostname did not resolve to a usable public address.")
    if any(not ipaddress.ip_address(ip).is_global for _, ip in candidates):
        raise UnsafeEgressTarget("Browser egress resolved to a non-public network address.")

    # DNS is resolved once here and the connection is opened to the exact validated IP.
    # This pins egress to the checked address and removes the validation/connect DNS race.
    unique: list[tuple[int, str]] = []
    for candidate in candidates:
        if candidate not in unique:
            unique.append(candidate)
    return unique


def _read_exact(sock: socket.socket, size: int) -> bytes:
    chunks: list[bytes] = []
    remaining = size
    while remaining:
        chunk = sock.recv(remaining)
        if not chunk:
            raise ConnectionError("SOCKS client closed unexpectedly.")
        chunks.append(chunk)
        remaining -= len(chunk)
    return b"".join(chunks)


def _relay(left: socket.socket, right: socket.socket) -> None:
    sockets = [left, right]
    while True:
        readable, _, _ = select.select(sockets, [], [], 30.0)
        if not readable:
            return
        for source in readable:
            target = right if source is left else left
            data = source.recv(64 * 1024)
            if not data:
                return
            target.sendall(data)


class _PublicSocksHandler(socketserver.BaseRequestHandler):
    def handle(self) -> None:
        client = self.request
        assert isinstance(client, socket.socket)
        client.settimeout(15.0)
        remote: socket.socket | None = None
        try:
            version, method_count = _read_exact(client, 2)
            if version != 5:
                return
            methods = _read_exact(client, method_count)
            if 0 not in methods:
                client.sendall(b"\x05\xff")
                return
            client.sendall(b"\x05\x00")

            version, command, reserved, address_type = _read_exact(client, 4)
            if version != 5 or command != 1 or reserved != 0:
                client.sendall(b"\x05\x07\x00\x01\x00\x00\x00\x00\x00\x00")
                return

            if address_type == 1:
                hostname = socket.inet_ntop(socket.AF_INET, _read_exact(client, 4))
            elif address_type == 3:
                length = _read_exact(client, 1)[0]
                hostname = _read_exact(client, length).decode("ascii", errors="strict")
            elif address_type == 4:
                hostname = socket.inet_ntop(socket.AF_INET6, _read_exact(client, 16))
            else:
                client.sendall(b"\x05\x08\x00\x01\x00\x00\x00\x00\x00\x00")
                return

            port = struct.unpack("!H", _read_exact(client, 2))[0]
            candidates = resolve_public_target(hostname, port)

            last_error: OSError | None = None
            for family, ip in candidates:
                try:
                    remote = socket.socket(family, socket.SOCK_STREAM)
                    remote.settimeout(10.0)
                    target = (ip, port, 0, 0) if family == socket.AF_INET6 else (ip, port)
                    remote.connect(target)
                    break
                except OSError as exc:
                    last_error = exc
                    if remote is not None:
                        remote.close()
                        remote = None

            if remote is None:
                raise last_error or OSError("No validated egress address connected.")

            client.sendall(b"\x05\x00\x00\x01\x00\x00\x00\x00\x00\x00")
            client.settimeout(None)
            remote.settimeout(None)
            _relay(client, remote)
        except UnsafeEgressTarget:
            try:
                client.sendall(b"\x05\x02\x00\x01\x00\x00\x00\x00\x00\x00")
            except OSError:
                pass
        except (ConnectionError, OSError, UnicodeError, ValueError):
            try:
                client.sendall(b"\x05\x04\x00\x01\x00\x00\x00\x00\x00\x00")
            except OSError:
                pass
        finally:
            if remote is not None:
                remote.close()


class _ThreadingSocksServer(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


class PublicSocksProxy(AbstractContextManager[str]):
    """Loopback SOCKS5 proxy that only connects to validated public HTTP(S) targets."""

    def __init__(self) -> None:
        self._server: _ThreadingSocksServer | None = None
        self._thread: Thread | None = None

    def __enter__(self) -> str:
        self._server = _ThreadingSocksServer(("127.0.0.1", 0), _PublicSocksHandler)
        self._thread = Thread(target=self._server.serve_forever, daemon=True)
        self._thread.start()
        host, port = self._server.server_address
        return f"socks5://{host}:{port}"

    def __exit__(self, exc_type, exc, tb) -> None:
        if self._server is not None:
            self._server.shutdown()
            self._server.server_close()
        if self._thread is not None:
            self._thread.join(timeout=2.0)
        self._server = None
        self._thread = None
