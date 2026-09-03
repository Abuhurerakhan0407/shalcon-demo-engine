from __future__ import annotations

from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread

from shalcon_runner.research import BrowserResearchEngine, ResearchLimits


class FixtureHandler(BaseHTTPRequestHandler):
    def log_message(self, format: str, *args: object) -> None:
        return

    def do_GET(self) -> None:  # noqa: N802 - BaseHTTPRequestHandler contract.
        if self.path == "/":
            body = """<!doctype html><html><head><title>Aura Salon Fixture</title></head><body>
            <h1>Aura</h1>
            <div id='dynamic'></div>
            <a href='/services'>Our Services</a>
            <a href='/services-error'>Services Error Fixture</a>
            <script>
              document.getElementById('dynamic').textContent='JS-rendered premium salon content';
              console.warn('fixture warning');
            </script>
            </body></html>"""
            self.send_response(200)
        elif self.path == "/services":
            body = "<!doctype html><html><head><title>Services</title></head><body><h1>Hair & Spa Services</h1></body></html>"
            self.send_response(200)
        elif self.path == "/services-error":
            body = "<!doctype html><html><head><title>Broken Services</title></head><body><h1>Temporary failure</h1></body></html>"
            self.send_response(500)
        else:
            body = "not found"
            self.send_response(404)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body.encode("utf-8"))))
        self.end_headers()
        self.wfile.write(body.encode("utf-8"))


def local_fixture_server():
    server = ThreadingHTTPServer(("127.0.0.1", 0), FixtureHandler)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server


def test_js_rendered_site_discovery_screenshots_and_diagnostics(tmp_path: Path) -> None:
    server = local_fixture_server()
    try:
        host, port = server.server_address
        base = f"http://{host}:{port}"
        engine = BrowserResearchEngine(
            validator=lambda url: url,
            artifacts_root=tmp_path,
            limits=ResearchLimits(max_pages=3, settle_ms=50, navigation_timeout_ms=5_000),
        )
        result = engine.research(
            job_id="job-phase9-browser",
            prospect_id="prospect-phase9",
            raw_url=f"{base}/",
            max_pages=3,
        )
    finally:
        server.shutdown()
        server.server_close()

    assert result["schemaVersion"] == "playwright-research.v1"
    assert result["sourceOnly"] is True
    assert result["prospectId"] == "prospect-phase9"
    assert result["pageCount"] == 3
    assert "facts" not in result

    pages = result["pages"]
    home = next(page for page in pages if page["finalUrl"] == f"{base}/")
    services = next(page for page in pages if page["finalUrl"] == f"{base}/services")
    broken = next(page for page in pages if page["finalUrl"] == f"{base}/services-error")

    assert "JS-rendered premium salon content" in home["text"]
    assert any(item["type"] == "warning" and "fixture warning" in item["text"] for item in home["console"])
    assert f"{base}/services" in home["discoveredLinks"]
    assert "Hair & Spa Services" in services["text"]
    assert broken["httpStatus"] == 500
    assert any(item["status"] == 500 for item in broken["httpErrors"])

    for page in pages:
        assert page["screenshotPath"] is not None
        assert Path(page["screenshotPath"]).is_file()
        assert page["requestedUrl"].startswith(base)
        assert len(page["html"]) <= 120_000
        assert len(page["text"]) <= 60_000
