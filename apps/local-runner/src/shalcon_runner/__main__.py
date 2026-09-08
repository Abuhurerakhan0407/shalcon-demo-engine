from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

from .ai_extract import (
    DEFAULT_OLLAMA_MODEL,
    DEFAULT_OLLAMA_URL,
    AiExtractionError,
    OllamaProvider,
    build_extraction_prompt,
)
from .client import RunnerApiClient, RunnerApiError
from .health import health_dict
from .worker import LocalRunnerWorker

_SAMPLE_BUSINESS = """Élane Salon is a hair and beauty salon in Mumbai. Services listed on this sample source are Haircut and Styling. Contact email: hello@example.com. This sample intentionally contains no phone number or opening hours."""


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="shalcon-runner")
    subcommands = parser.add_subparsers(dest="command", required=True)
    subcommands.add_parser("health", help="Print local runner health as JSON")

    once = subcommands.add_parser("once", help="Heartbeat and process at most one due job")
    once.add_argument("--api-url", default=os.environ.get("SHALCON_API_BASE_URL", "http://127.0.0.1:8787"))
    once.add_argument("--token", default=os.environ.get("SHALCON_RUNNER_TOKEN"))

    run = subcommands.add_parser("run", help="Continuously poll and process due jobs")
    run.add_argument("--api-url", default=os.environ.get("SHALCON_API_BASE_URL", "http://127.0.0.1:8787"))
    run.add_argument("--token", default=os.environ.get("SHALCON_RUNNER_TOKEN"))
    run.add_argument("--poll-seconds", type=float, default=3.0)

    smoke = subcommands.add_parser("ai-smoke", help="Run one real structured extraction against local Ollama")
    smoke.add_argument("--ollama-url", default=os.environ.get("SHALCON_OLLAMA_URL", DEFAULT_OLLAMA_URL))
    smoke.add_argument("--model", default=os.environ.get("SHALCON_OLLAMA_MODEL", DEFAULT_OLLAMA_MODEL))
    smoke.add_argument("--source-file", type=Path)
    return parser


def worker_from_args(args: argparse.Namespace) -> LocalRunnerWorker:
    if not args.token:
        raise RunnerApiError("SHALCON_RUNNER_TOKEN is required for runner execution.")
    return LocalRunnerWorker(RunnerApiClient(args.api_url, args.token))


def run_ai_smoke(args: argparse.Namespace) -> int:
    source_text = _SAMPLE_BUSINESS
    if args.source_file is not None:
        try:
            source_text = args.source_file.read_text(encoding="utf-8")
        except (OSError, UnicodeError) as exc:
            raise AiExtractionError("AI_SMOKE_SOURCE_INVALID", "AI smoke source file could not be read safely.") from exc
    if not source_text.strip() or len(source_text) > 40_000:
        raise AiExtractionError("AI_SMOKE_SOURCE_INVALID", "AI smoke source text is empty or oversized.")

    provider = OllamaProvider(args.ollama_url, timeout_seconds=60.0, retries=1)
    health = provider.health(args.model)
    if not health.model_available:
        raise AiExtractionError("OLLAMA_MODEL_MISSING", "Configured Ollama model is not installed.")
    extracted, attempts = provider.generate_structured(args.model, build_extraction_prompt(source_text))
    print(
        json.dumps(
            {
                "ok": True,
                "provider": "ollama",
                "model": args.model,
                "schemaVersion": "business-extraction.v1",
                "sourceOnly": True,
                "verified": False,
                "attempts": attempts,
                "extracted": extracted,
            },
            ensure_ascii=False,
            sort_keys=True,
        )
    )
    return 0


def main() -> int:
    args = build_parser().parse_args()
    if args.command == "health":
        print(json.dumps(health_dict(), sort_keys=True))
        return 0

    try:
        if args.command == "ai-smoke":
            return run_ai_smoke(args)
        worker = worker_from_args(args)
        if args.command == "once":
            outcome = worker.run_once()
            print(json.dumps(outcome.__dict__, sort_keys=True))
            return 0
        if args.command == "run":
            worker.run_forever(args.poll_seconds)
            return 0
    except (RunnerApiError, AiExtractionError) as error:
        safe_error = error.safe_message if isinstance(error, AiExtractionError) else str(error)
        code = error.code if isinstance(error, AiExtractionError) else "RUNNER_API_ERROR"
        print(json.dumps({"ok": False, "errorCode": code, "error": safe_error}, sort_keys=True))
        return 1
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
