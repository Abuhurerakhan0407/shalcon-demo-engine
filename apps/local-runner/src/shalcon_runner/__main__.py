from __future__ import annotations

import argparse
import json
import os

from .client import RunnerApiClient, RunnerApiError
from .health import health_dict
from .worker import LocalRunnerWorker


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
    return parser


def worker_from_args(args: argparse.Namespace) -> LocalRunnerWorker:
    if not args.token:
        raise RunnerApiError("SHALCON_RUNNER_TOKEN is required for runner execution.")
    return LocalRunnerWorker(RunnerApiClient(args.api_url, args.token))


def main() -> int:
    args = build_parser().parse_args()
    if args.command == "health":
        print(json.dumps(health_dict(), sort_keys=True))
        return 0

    try:
        worker = worker_from_args(args)
        if args.command == "once":
            outcome = worker.run_once()
            print(json.dumps(outcome.__dict__, sort_keys=True))
            return 0
        if args.command == "run":
            worker.run_forever(args.poll_seconds)
            return 0
    except RunnerApiError as error:
        print(json.dumps({"ok": False, "error": str(error)}, sort_keys=True))
        return 1
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
