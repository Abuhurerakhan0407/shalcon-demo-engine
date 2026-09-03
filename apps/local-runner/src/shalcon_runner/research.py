from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
import hashlib
import os
from pathlib import Path
import re
from typing import Any, Callable
from urllib.parse import urljoin, urlsplit

from playwright.sync_api import BrowserContext, Page, TimeoutError as PlaywrightTimeoutError, sync_playwright

from .client import ClaimedJob
from .url_safety import UnsafeResearchUrl, validate_public_http_url

UrlValidator = Callable[[str], str]


class ResearchJobError(RuntimeError):
    def __init__(self, code: str, safe_message: str) -> None:
        super().__init__(safe_message)
        self.code = code[:80]
        self.safe_message = safe_message[:500]


@dataclass(frozen=True)
class ResearchLimits:
    max_pages: int = 4
    navigation_timeout_ms: int = 20_000
    settle_ms: int = 400
    max_text_chars: int = 60_000
    max_html_chars: int = 120_000
    max_diagnostics: int = 100


_RELEVANT_TERMS = (
    "about",
    "service",
    "treatment",
    "spa",
    "salon",
    "contact",
    "book",
    "appointment",
    "price",
    "menu",
    "location",
    "hours",
    "team",
)


def _safe_job_segment(value: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9_.-]+", "-", value).strip("-.")
    return cleaned[:80] or "job"


def _utc_now() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


def _bounded(value: str, limit: int) -> str:
    if len(value) <= limit:
        return value
    return value[:limit]


def _link_score(url: str, text: str) -> tuple[int, str]:
    haystack = f"{url} {text}".lower()
    score = sum(3 if term in url.lower() else 1 for term in _RELEVANT_TERMS if term in haystack)
    return (-score, url)


class BrowserResearchEngine:
    def __init__(
        self,
        *,
        validator: UrlValidator = validate_public_http_url,
        artifacts_root: Path | None = None,
        limits: ResearchLimits | None = None,
    ) -> None:
        self.validator = validator
        self.artifacts_root = artifacts_root or Path(
            os.environ.get("SHALCON_ARTIFACTS_DIR", "artifacts/research")
        )
        self.limits = limits or ResearchLimits()

    def _route_guard(self, context: BrowserContext) -> None:
        validator = self.validator

        def guard(route: Any) -> None:
            request_url = str(route.request.url)
            scheme = urlsplit(request_url).scheme.lower()
            if scheme in {"http", "https"}:
                try:
                    validator(request_url)
                except (UnsafeResearchUrl, ValueError):
                    route.abort("blockedbyclient")
                    return
            route.continue_()

        context.route("**/*", guard)

    def _discover_links(self, page: Page, base_url: str) -> list[str]:
        try:
            raw_links = page.locator("a[href]").evaluate_all(
                "els => els.map(a => ({href: a.getAttribute('href') || '', text: (a.textContent || '').trim()}))"
            )
        except Exception:  # noqa: BLE001 - discovery failure should not fail source capture.
            return []

        base_host = (urlsplit(base_url).hostname or "").lower()
        candidates: dict[str, str] = {}
        for item in raw_links if isinstance(raw_links, list) else []:
            if not isinstance(item, dict):
                continue
            href = item.get("href")
            text = item.get("text")
            if not isinstance(href, str) or not href.strip():
                continue
            absolute = urljoin(base_url, href.strip())
            try:
                normalized = self.validator(absolute)
            except (UnsafeResearchUrl, ValueError):
                continue
            if (urlsplit(normalized).hostname or "").lower() != base_host:
                continue
            candidates.setdefault(normalized, text if isinstance(text, str) else "")

        ordered = sorted(candidates, key=lambda url: _link_score(url, candidates[url]))
        return ordered

    def _capture_page(self, context: BrowserContext, requested_url: str, job_dir: Path) -> dict[str, Any]:
        page = context.new_page()
        console_messages: list[dict[str, str]] = []
        request_failures: list[dict[str, str]] = []
        http_errors: list[dict[str, Any]] = []

        def on_console(message: Any) -> None:
            if len(console_messages) >= self.limits.max_diagnostics:
                return
            message_type = str(message.type)
            if message_type in {"warning", "error"}:
                console_messages.append({"type": message_type, "text": _bounded(str(message.text), 1000)})

        def on_request_failed(request: Any) -> None:
            if len(request_failures) >= self.limits.max_diagnostics:
                return
            request_failures.append(
                {
                    "url": _bounded(str(request.url), 2048),
                    "error": _bounded(str(request.failure or "network failure"), 500),
                }
            )

        def on_response(response: Any) -> None:
            if len(http_errors) >= self.limits.max_diagnostics:
                return
            if int(response.status) >= 400:
                http_errors.append({"url": _bounded(str(response.url), 2048), "status": int(response.status)})

        page.on("console", on_console)
        page.on("requestfailed", on_request_failed)
        page.on("response", on_response)

        captured_at = _utc_now()
        navigation_error: str | None = None
        response_status: int | None = None
        final_url = requested_url
        title = ""
        text = ""
        html = ""
        discovered_links: list[str] = []
        screenshot_path: str | None = None

        try:
            response = page.goto(
                requested_url,
                wait_until="domcontentloaded",
                timeout=self.limits.navigation_timeout_ms,
            )
            if response is not None:
                response_status = int(response.status)
            page.wait_for_timeout(self.limits.settle_ms)
            try:
                page.wait_for_load_state("networkidle", timeout=2_000)
            except PlaywrightTimeoutError:
                pass

            final_url = self.validator(page.url)
            title = _bounded(page.title(), 500)
            try:
                text = _bounded(page.locator("body").inner_text(timeout=3_000), self.limits.max_text_chars)
            except Exception:  # noqa: BLE001 - retain the page even when text extraction fails.
                text = ""
            html = _bounded(page.content(), self.limits.max_html_chars)
            discovered_links = self._discover_links(page, final_url)

            digest = hashlib.sha256(final_url.encode("utf-8")).hexdigest()[:16]
            screenshot_file = job_dir / f"{digest}.png"
            try:
                page.screenshot(path=str(screenshot_file), full_page=True, animations="disabled")
                screenshot_path = str(screenshot_file)
            except Exception:  # noqa: BLE001 - screenshot failure is diagnostic, not source loss.
                screenshot_path = None
        except (UnsafeResearchUrl, PlaywrightTimeoutError, Exception) as exc:  # noqa: BLE001 - browser boundary reports safely.
            navigation_error = f"{type(exc).__name__}: navigation failed safely."[:500]
            try:
                if page.url and page.url != "about:blank":
                    final_url = page.url
            except Exception:  # noqa: BLE001
                pass
        finally:
            page.close()

        return {
            "requestedUrl": requested_url,
            "finalUrl": final_url,
            "capturedAt": captured_at,
            "httpStatus": response_status,
            "title": title,
            "text": text,
            "html": html,
            "screenshotPath": screenshot_path,
            "navigationError": navigation_error,
            "console": console_messages,
            "requestFailures": request_failures,
            "httpErrors": http_errors,
            "discoveredLinks": discovered_links[:50],
        }

    def research(self, *, job_id: str, prospect_id: str, raw_url: str, max_pages: int | None = None) -> dict[str, Any]:
        try:
            start_url = self.validator(raw_url)
        except (UnsafeResearchUrl, ValueError) as exc:
            raise ResearchJobError("UNSAFE_RESEARCH_URL", "Research URL failed the public-network safety policy.") from exc

        requested_max = self.limits.max_pages if max_pages is None else int(max_pages)
        page_limit = min(max(requested_max, 1), 6)
        job_dir = self.artifacts_root / _safe_job_segment(job_id)
        job_dir.mkdir(parents=True, exist_ok=True)

        pages: list[dict[str, Any]] = []
        visited: set[str] = set()
        queue: list[str] = [start_url]

        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True)
            context = browser.new_context(
                viewport={"width": 1440, "height": 900},
                ignore_https_errors=False,
                java_script_enabled=True,
            )
            self._route_guard(context)
            try:
                while queue and len(pages) < page_limit:
                    current = queue.pop(0)
                    if current in visited:
                        continue
                    visited.add(current)
                    page_result = self._capture_page(context, current, job_dir)
                    pages.append(page_result)
                    for discovered in page_result.get("discoveredLinks", []):
                        if isinstance(discovered, str) and discovered not in visited and discovered not in queue:
                            queue.append(discovered)
            finally:
                context.close()
                browser.close()

        return {
            "schemaVersion": "playwright-research.v1",
            "jobId": job_id,
            "prospectId": prospect_id,
            "requestedUrl": start_url,
            "capturedAt": _utc_now(),
            "pages": pages,
            "pageCount": len(pages),
            "sourceOnly": True,
        }


def research_job(job: ClaimedJob) -> dict[str, Any]:
    if not isinstance(job.payload, dict):
        raise ResearchJobError("INVALID_RESEARCH_PAYLOAD", "Research job payload must be an object.")
    raw_url = job.payload.get("url")
    if not isinstance(raw_url, str) or not raw_url.strip():
        raise ResearchJobError("INVALID_RESEARCH_PAYLOAD", "Research job requires a website URL.")
    raw_max_pages = job.payload.get("maxPages", 4)
    if isinstance(raw_max_pages, bool) or not isinstance(raw_max_pages, int):
        raise ResearchJobError("INVALID_RESEARCH_PAYLOAD", "Research maxPages must be an integer.")
    return BrowserResearchEngine().research(
        job_id=job.id,
        prospect_id=job.entity_id,
        raw_url=raw_url,
        max_pages=raw_max_pages,
    )
