from __future__ import annotations

import argparse
import json
import os
import time

from shalcon_runner.client import RunnerApiClient, RunnerApiError
from shalcon_runner.worker import LocalRunnerWorker


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="phase20-research-pilot")
    parser.add_argument("--api-url", default=os.environ.get("SHALCON_API_BASE_URL", "http://127.0.0.1:8807"))
    parser.add_argument("--token", default=os.environ.get("SHALCON_RUNNER_TOKEN"))
    parser.add_argument("--jobs", type=int, default=3)
    return parser


def main() -> int:
    args = build_parser().parse_args()
    if not args.token:
        raise RunnerApiError("SHALCON_RUNNER_TOKEN is required for the Phase 20 pilot.")
    if args.jobs < 1 or args.jobs > 3:
        raise RunnerApiError("Phase 20 pilot job count must be between 1 and 3.")

    worker = LocalRunnerWorker(
        RunnerApiClient(args.api_url, args.token, timeout_seconds=30.0),
        capabilities=["PLAYWRIGHT_RESEARCH"],
    )
    completed: list[dict[str, str]] = []
    idle_rounds = 0
    while len(completed) < args.jobs:
        outcome = worker.run_once()
        if outcome.status == "IDLE":
            idle_rounds += 1
            if idle_rounds >= 10:
                raise RunnerApiError("Phase 20 pilot became idle before every research job completed.")
            time.sleep(0.5)
            continue
        idle_rounds = 0
        if outcome.status != "COMPLETED" or outcome.job_type != "PLAYWRIGHT_RESEARCH" or not outcome.job_id:
            raise RunnerApiError("A Phase 20 real research job failed safely.")
        completed.append({"jobId": outcome.job_id, "jobType": outcome.job_type, "status": outcome.status})

    print(json.dumps({"ok": True, "completed": completed, "trialResultsModified": False}, sort_keys=True))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except RunnerApiError as error:
        print(json.dumps({"ok": False, "error": str(error)}, sort_keys=True))
        raise SystemExit(1) from error
