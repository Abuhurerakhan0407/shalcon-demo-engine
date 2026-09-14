from __future__ import annotations

import argparse
import json
import os

from shalcon_runner.ai_extract import ai_extract_job
from shalcon_runner.client import RunnerApiClient, RunnerApiError


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="phase20-ai-probe")
    parser.add_argument("--api-url", default=os.environ.get("SHALCON_API_BASE_URL", "http://127.0.0.1:8807"))
    parser.add_argument("--token", default=os.environ.get("SHALCON_RUNNER_TOKEN"))
    return parser


def main() -> int:
    args = build_parser().parse_args()
    if not args.token:
        raise RunnerApiError("SHALCON_RUNNER_TOKEN is required for the Phase 20 AI probe.")

    client = RunnerApiClient(args.api_url, args.token, timeout_seconds=30.0)
    client.heartbeat("phase20-ai-probe", ["LOCAL_AI_EXTRACT"])
    job = client.claim()
    if job is None or job.job_type != "LOCAL_AI_EXTRACT":
        raise RunnerApiError("Phase 20 AI probe expected a LOCAL_AI_EXTRACT job.")

    result = ai_extract_job(job)
    if result.get("sourceOnly") is not True or result.get("verified") is not False:
        raise RunnerApiError("Phase 20 AI probe result invariants failed.")
    if result.get("provider") != "ollama":
        raise RunnerApiError("Phase 20 AI probe did not use Ollama.")

    extracted = result.get("extracted")
    if not isinstance(extracted, dict):
        raise RunnerApiError("Phase 20 AI probe returned invalid extracted data.")

    print(json.dumps({
        "ok": True,
        "jobId": job.id,
        "sourceChars": len(job.payload.get("sourceText", "")) if isinstance(job.payload, dict) else 0,
        "provider": result.get("provider"),
        "model": result.get("model"),
        "adapter": result.get("adapter"),
        "extractedFields": sorted(extracted.keys()),
        "trialResultsModified": False,
    }, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
