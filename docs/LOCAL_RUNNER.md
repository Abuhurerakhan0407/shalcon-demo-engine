# Local Runner

The local runner is the heavy execution plane. Cloudflare remains the control plane and D1 remains the canonical job ledger.

## Current capabilities

- Runner registration/token authentication and heartbeat.
- Claim/lease/retry/dead-letter job lifecycle.
- Automatic lease renewal while a long-running handler is executing.
- Playwright research with bounded source capture and diagnostics.
- Public-only browser egress through a local SOCKS5 gate that pins connections to validated public IPs.
- Service Workers blocked and WebSockets disconnected during research.
- Source-only research completion; browser research does not manufacture verified facts.

## Health

```bash
cd apps/local-runner
PYTHONPATH=src python3 -m shalcon_runner health
```

## Run worker

Configure the runner API URL and token according to `.env.example`, then run the worker command documented by `python -m shalcon_runner --help`.

The machine must remain online while local jobs execute. Cloud jobs remain in D1 when the runner is offline and are reclaimed through the lease/retry system.

## Security boundary

Research is public-web only. Production browser jobs reject private/link-local/loopback targets and non-standard web ports, remove Chromium's implicit loopback proxy bypass, and route browser traffic through the public-only SOCKS egress gate. Never disable the production egress proxy for untrusted prospect URLs.
