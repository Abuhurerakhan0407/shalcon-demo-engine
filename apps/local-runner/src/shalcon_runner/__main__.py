from __future__ import annotations

import argparse
import json

from .health import health_dict


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="shalcon-runner")
    subcommands = parser.add_subparsers(dest="command", required=True)
    subcommands.add_parser("health", help="Print local runner health as JSON")
    return parser


def main() -> int:
    args = build_parser().parse_args()
    if args.command == "health":
        print(json.dumps(health_dict(), sort_keys=True))
        return 0
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
