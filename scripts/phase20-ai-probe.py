from __future__ import annotations

import argparse
import json
import os

from shalcon_runner.client import RunnerApiClient, RunnerApiError
from shalcon_runner.worker import LocalRunnerWorker


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="phase20-ai-probe")
    parser.add_argument("--api-url", default=os.environ.get("SHALCON_API_BASE_URL", "http://127.0.0.1:8807"))
    parser.add_argument("--token", default=os.environ.get("SHALCON_RUNNER_TOKEN"))
    parser.add_argument("--jobs", type=int, default=1)
    return parser


def main() -> int:
    args = build_parser().parse_args()
    if not args.token:
        raise RunnerApiError("SHALCON_RUNNER_TOKEN is required for the Phase 20 AI probe.")
    if args.jobs < 1 or args.jobs > 6:
        raise RunnerApiError("Phase 20 AI probe job count must be between 1 and 6.")

    client = RunnerApiClient(args.api_url, args.token, timeout_seconds=30.0)
    worker = LocalRunnerWorker(client, capabilities=["LOCAL_AI_EXTRACT"])
    completed: list[dict[str, str]] = []

    for _ in range(args.jobs):
        outcome = worker.run_once()
        if outcome.status != "COMPLETED" or outcome.job_type != "LOCAL_AI_EXTRACT" or not outcome.job_id:
            raise RunnerApiError("A Phase 20 real AI extraction job failed safely.")
        completed.append({
            "jobId": outcome.job_id,
            "jobType": outcome.job_type,
            "status": outcome.status,
        })

    print(json.dumps({
        "ok": True,
        "completed": completed,
        "completedCount": len(completed),
        "provider": "ollama",
        "sourceOnly": True,
        "verified": False,
        "trialResultsModified": False,
    }, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
