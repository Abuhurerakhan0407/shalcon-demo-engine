from __future__ import annotations

import base64
from pathlib import Path

from playwright.sync_api import sync_playwright

from shalcon_runner.visual_qa import BrowserVisualQaEngine, _broken_image_count, _settle_images


VIEWPORTS = {
    "desktop": {"width": 1440, "height": 900},
    "mobile": {"width": 390, "height": 844},
}


GOOD_HTML = """<!doctype html>
<html>
<head>
  <meta name="robots" content="noindex,nofollow,noarchive">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; max-width: 100%; overflow-x: hidden; }
    body { font-family: sans-serif; }
    header { min-height: 72vh; padding: 48px 24px; display: grid; align-content: center; }
    main { padding: 24px; }
    footer { padding: 24px; }
    a { display: inline-block; padding: 12px 18px; }
  </style>
</head>
<body>
  <header id="heroTitle">
    <h1>A considered salon experience.</h1>
    <p>A private website concept assembled from verified business evidence.</p>
    <a href="tel:+919876543210">Call to enquire</a>
  </header>
  <main><p>Hair and beauty services in Mumbai.</p></main>
  <footer>Concept preview prepared by Shalcon Intelligence · ÉLANE v8</footer>
</body>
</html>"""


BROKEN_HTML = """<!doctype html>
<html>
<head>
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <style>
    body { margin: 0; font-family: sans-serif; }
    #heroTitle { width: 1600px; min-height: 500px; padding: 24px; }
  </style>
</head>
<body>
  <header id="heroTitle"><h1>Lorem ipsum</h1><img src="/definitely-missing-phase18.png"></header>
  <main><p>{{replace me}}</p></main>
  <script>console.error('fixture console error'); setTimeout(() => { throw new Error('fixture page error'); }, 0);</script>
</body>
</html>"""


def _run(tmp_path: Path, html: str, job_id: str) -> dict:
    return BrowserVisualQaEngine(artifacts_root=tmp_path).run(
        job_id=job_id,
        demo_id="demo_phase18_fixture",
        html=html,
        viewports=VIEWPORTS,
    )


def test_visual_qa_good_fixture_passes_all_required_checks_and_writes_four_pngs(tmp_path: Path) -> None:
    result = _run(tmp_path, GOOD_HTML, "job_good")

    assert result["schemaVersion"] == "visual-qa.v1"
    assert result["demoId"] == "demo_phase18_fixture"
    assert len(result["screenshots"]) == 4
    assert {item["kind"] for item in result["screenshots"]} == {
        "DESKTOP_FULL", "DESKTOP_HERO", "MOBILE_FULL", "MOBILE_HERO"
    }

    for viewport in (result["desktop"], result["mobile"]):
        assert viewport["horizontalOverflow"] is False
        assert viewport["brokenImageCount"] == 0
        assert viewport["consoleErrors"] == []
        assert viewport["pageErrors"] == []
        assert viewport["ctaPresent"] is True
        assert viewport["placeholderCount"] == 0
        assert viewport["disclosurePresent"] is True
        assert viewport["noindexPresent"] is True

    for screenshot in result["screenshots"]:
        assert screenshot["mimeType"] == "image/png"
        assert len(screenshot["sha256"]) == 64
        relative_name = screenshot["storageRef"].rsplit("/", 1)[-1]
        assert (tmp_path / "job_good" / relative_name).is_file()


def test_visual_qa_broken_fixture_is_detected_on_desktop_and_mobile(tmp_path: Path) -> None:
    result = _run(tmp_path, BROKEN_HTML, "job_broken")

    for viewport in (result["desktop"], result["mobile"]):
        assert viewport["horizontalOverflow"] is True
        assert viewport["brokenImageCount"] >= 1
        assert viewport["consoleErrors"]
        assert viewport["pageErrors"]
        assert viewport["ctaPresent"] is False
        assert viewport["placeholderCount"] >= 2
        assert viewport["disclosurePresent"] is False
        assert viewport["noindexPresent"] is False


def test_settle_images_loads_offscreen_lazy_images() -> None:
    png = base64.b64decode(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
    )
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 390, "height": 844})
        page = context.new_page()
        page.route(
            "https://fixture.invalid/lazy.png",
            lambda route: route.fulfill(status=200, content_type="image/png", body=png),
        )
        page.set_content(
            '<div style="height:20000px"></div><img loading="lazy" src="https://fixture.invalid/lazy.png">',
            wait_until="domcontentloaded",
        )
        page.wait_for_timeout(100)
        assert _broken_image_count(page) == 1
        _settle_images(page, 2_000)
        assert _broken_image_count(page) == 0
        context.close()
        browser.close()
