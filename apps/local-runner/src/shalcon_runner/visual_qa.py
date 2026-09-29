from __future__ import annotations

from dataclasses import dataclass
import hashlib
import os
from pathlib import Path
import re
from typing import Any

from playwright.sync_api import Page, TimeoutError as PlaywrightTimeoutError, sync_playwright

from .client import ClaimedJob, RunnerApiClient


class VisualQaJobError(RuntimeError):
    def __init__(self, code: str, safe_message: str) -> None:
        super().__init__(safe_message)
        self.code = code[:80]
        self.safe_message = safe_message[:500]


@dataclass(frozen=True)
class VisualQaLimits:
    navigation_timeout_ms: int = 20_000
    settle_ms: int = 350
    image_settle_timeout_ms: int = 10_000
    max_errors: int = 100
    max_document_height: int = 100_000


_PLACEHOLDER_PATTERNS = (
    re.compile(r"\blorem ipsum\b", re.IGNORECASE),
    re.compile(r"\bTODO\b"),
    re.compile(r"\breplace me\b", re.IGNORECASE),
    re.compile(r"\{\{[^{}]{1,120}\}\}"),
    re.compile(r"\[placeholder\]", re.IGNORECASE),
    re.compile(r"\bundefined\b", re.IGNORECASE),
)

_CTA_PATTERN = re.compile(
    r"\b(book|appointment|enquir|whatsapp|call|contact|email|request|schedule|reserve)\w*\b",
    re.IGNORECASE,
)


def _safe_segment(value: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9_.-]+", "-", value).strip("-.")
    return cleaned[:100] or "job"


def _bounded_errors(items: list[str], limit: int) -> list[str]:
    return [item[:1000] for item in items[:limit]]


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _placeholder_count(text: str) -> int:
    return sum(len(pattern.findall(text)) for pattern in _PLACEHOLDER_PATTERNS)


def _cta_present(page: Page) -> bool:
    try:
        candidates = page.locator("a, button, [role='button']")
        count = min(candidates.count(), 250)
        for index in range(count):
            node = candidates.nth(index)
            try:
                if not node.is_visible():
                    continue
                label = " ".join(
                    part
                    for part in [
                        node.inner_text(timeout=500),
                        node.get_attribute("aria-label") or "",
                        node.get_attribute("title") or "",
                    ]
                    if part
                )
                if _CTA_PATTERN.search(label):
                    return True
            except Exception:
                continue
    except Exception:
        return False
    return False


def _page_metrics(page: Page) -> dict[str, int | bool]:
    raw = page.evaluate(
        """() => ({
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
          documentWidth: document.documentElement.scrollWidth,
          documentHeight: document.documentElement.scrollHeight
        })"""
    )
    return {
        "viewportWidth": max(1, int(raw.get("viewportWidth", 1))),
        "viewportHeight": max(1, int(raw.get("viewportHeight", 1))),
        "documentWidth": max(0, int(raw.get("documentWidth", 0))),
        "documentHeight": max(0, int(raw.get("documentHeight", 0))),
        "horizontalOverflow": int(raw.get("documentWidth", 0)) > int(raw.get("viewportWidth", 0)) + 2,
    }


def _broken_image_count(page: Page) -> int:
    result = page.locator("img").evaluate_all(
        "els => els.filter(img => !img.complete || img.naturalWidth <= 0 || img.naturalHeight <= 0).length"
    )
    return max(0, int(result))


def _settle_images(page: Page, timeout_ms: int) -> None:
    page.locator("img").evaluate_all(
        'els => els.forEach(img => { img.loading = \"eager\"; })'
    )
    try:
        page.wait_for_function(
            "() => Array.from(document.images).every(img => img.complete)",
            timeout=timeout_ms,
        )
    except PlaywrightTimeoutError:
        # Timed-out images remain incomplete and are counted as broken below.
        pass


def _noindex_present(page: Page) -> bool:
    try:
        content = page.locator("meta[name='robots']").first.get_attribute("content") or ""
        lowered = content.lower()
        return "noindex" in lowered and "nofollow" in lowered
    except Exception:
        return False


def _disclosure_present(body_text: str) -> bool:
    lowered = body_text.lower()
    return "concept preview prepared by shalcon intelligence" in lowered and "concept" in lowered


def _hero_locator(page: Page):
    for selector in ("#heroTitle", "header", "main"):
        locator = page.locator(selector).first
        try:
            if locator.count() and locator.is_visible():
                return locator
        except Exception:
            continue
    return page.locator("body")


class BrowserVisualQaEngine:
    def __init__(self, *, artifacts_root: Path | None = None, limits: VisualQaLimits | None = None) -> None:
        self.artifacts_root = artifacts_root or Path(
            os.environ.get("SHALCON_VISUAL_QA_ARTIFACTS_DIR", "artifacts/visual-qa")
        )
        self.limits = limits or VisualQaLimits()

    def _capture_viewport(
        self,
        *,
        browser: Any,
        html: str,
        job_dir: Path,
        job_segment: str,
        label: str,
        width: int,
        height: int,
    ) -> tuple[dict[str, Any], list[dict[str, Any]]]:
        context = browser.new_context(
            viewport={"width": width, "height": height},
            java_script_enabled=True,
            service_workers="block",
            reduced_motion="reduce",
        )
        page = context.new_page()
        console_errors: list[str] = []
        page_errors: list[str] = []
        page.on(
            "console",
            lambda message: console_errors.append(message.text)
            if message.type == "error" and len(console_errors) < self.limits.max_errors
            else None,
        )
        page.on(
            "pageerror",
            lambda error: page_errors.append(str(error))
            if len(page_errors) < self.limits.max_errors
            else None,
        )

        try:
            page.set_content(
                html,
                wait_until="domcontentloaded",
                timeout=self.limits.navigation_timeout_ms,
            )
            page.emulate_media(reduced_motion="reduce")
            _settle_images(page, self.limits.image_settle_timeout_ms)
            page.wait_for_timeout(self.limits.settle_ms)
            body_text = page.locator("body").inner_text(timeout=3_000)
            metrics = _page_metrics(page)
            if int(metrics["documentHeight"]) > self.limits.max_document_height:
                raise VisualQaJobError(
                    "VISUAL_QA_DOCUMENT_TOO_TALL",
                    "Visual QA document exceeded the safe screenshot height limit.",
                )

            full_path = job_dir / f"{label}.full.png"
            page.screenshot(path=str(full_path), full_page=True, animations="disabled")

            hero = _hero_locator(page)
            hero_box = hero.bounding_box()
            hero_path = job_dir / f"{label}.hero.png"
            hero.screenshot(path=str(hero_path), animations="disabled")

            full_height = max(1, int(metrics["documentHeight"]))
            hero_width = max(1, int(round((hero_box or {}).get("width", width))))
            hero_height = max(1, int(round((hero_box or {}).get("height", min(height, full_height)))))
            upper = label.upper()
            screenshots = [
                {
                    "kind": f"{upper}_FULL",
                    "storageRef": f"runner-artifact://visual-qa/{job_segment}/{full_path.name}",
                    "mimeType": "image/png",
                    "width": width,
                    "height": full_height,
                    "sha256": _sha256(full_path),
                },
                {
                    "kind": f"{upper}_HERO",
                    "storageRef": f"runner-artifact://visual-qa/{job_segment}/{hero_path.name}",
                    "mimeType": "image/png",
                    "width": hero_width,
                    "height": hero_height,
                    "sha256": _sha256(hero_path),
                },
            ]
            checks = {
                **metrics,
                "brokenImageCount": _broken_image_count(page),
                "consoleErrors": _bounded_errors(console_errors, self.limits.max_errors),
                "pageErrors": _bounded_errors(page_errors, self.limits.max_errors),
                "ctaPresent": _cta_present(page),
                "placeholderCount": _placeholder_count(body_text),
                "disclosurePresent": _disclosure_present(body_text),
                "noindexPresent": _noindex_present(page),
            }
            return checks, screenshots
        finally:
            context.close()

    def run(self, *, job_id: str, demo_id: str, html: str, viewports: dict[str, Any]) -> dict[str, Any]:
        if not isinstance(html, str) or not html.strip():
            raise VisualQaJobError("VISUAL_QA_INVALID_INPUT", "Visual QA requires rendered HTML.")
        job_segment = _safe_segment(job_id)
        job_dir = self.artifacts_root / job_segment
        job_dir.mkdir(parents=True, exist_ok=True)

        desktop = viewports.get("desktop") if isinstance(viewports, dict) else None
        mobile = viewports.get("mobile") if isinstance(viewports, dict) else None
        if not isinstance(desktop, dict) or not isinstance(mobile, dict):
            raise VisualQaJobError("VISUAL_QA_INVALID_INPUT", "Visual QA viewports are missing.")

        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True)
            try:
                desktop_result, desktop_shots = self._capture_viewport(
                    browser=browser,
                    html=html,
                    job_dir=job_dir,
                    job_segment=job_segment,
                    label="desktop",
                    width=int(desktop.get("width", 1440)),
                    height=int(desktop.get("height", 900)),
                )
                mobile_result, mobile_shots = self._capture_viewport(
                    browser=browser,
                    html=html,
                    job_dir=job_dir,
                    job_segment=job_segment,
                    label="mobile",
                    width=int(mobile.get("width", 390)),
                    height=int(mobile.get("height", 844)),
                )
            finally:
                browser.close()

        return {
            "schemaVersion": "visual-qa.v1",
            "demoId": demo_id,
            "desktop": desktop_result,
            "mobile": mobile_result,
            "screenshots": [*desktop_shots, *mobile_shots],
        }


def visual_qa_job(job: ClaimedJob, client: RunnerApiClient) -> dict[str, Any]:
    try:
        qa_input = client.visual_qa_input(job.id)
    except Exception as exc:
        raise VisualQaJobError(
            "VISUAL_QA_INPUT_FAILED",
            "Visual QA input could not be loaded from the control plane.",
        ) from exc

    demo_id = qa_input.get("demoId")
    html = qa_input.get("html")
    viewports = qa_input.get("viewports")
    if not isinstance(demo_id, str) or not demo_id:
        raise VisualQaJobError("VISUAL_QA_INVALID_INPUT", "Visual QA demo id is missing.")
    if not isinstance(html, str):
        raise VisualQaJobError("VISUAL_QA_INVALID_INPUT", "Visual QA rendered HTML is missing.")
    if not isinstance(viewports, dict):
        raise VisualQaJobError("VISUAL_QA_INVALID_INPUT", "Visual QA viewport contract is missing.")

    return BrowserVisualQaEngine().run(
        job_id=job.id,
        demo_id=demo_id,
        html=html,
        viewports=viewports,
    )
