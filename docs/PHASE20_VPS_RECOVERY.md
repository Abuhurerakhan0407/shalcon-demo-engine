# Phase 20 VPS Recovery

Use this only when the original laptop-local Phase 20 operator workspace is no longer available.

## What is recoverable

The GitHub repository, locked 20-prospect cohort, Phase 20 code, operator UI, migrations, and trial rules remain authoritative. The old laptop-local `.wrangler/phase20-operator` D1 database cannot be reconstructed byte-for-byte unless a copy is recovered from that machine. Therefore this recovery starts a new clean Phase 20 operator D1 and reruns research/AI extraction without changing any trial result fields.

Phase 20 remains active. Do not advance to Phase 21 and do not change the overall launch percentage merely because the workspace moved to a VPS.

## Recovery safeguards added for the VPS run

- `qwen3:4b` remains the local structured extraction model.
- Ollama structured generation sends `think: false`, preventing Qwen reasoning text from corrupting the strict JSON result.
- Real extraction defaults to a bounded 120-second Ollama request timeout and supports `SHALCON_OLLAMA_TIMEOUT_SECONDS` values from 1 through 120 seconds.
- Strict extraction schema, source-only provenance, and `verified: false` remain unchanged.
- The worker continues renewing leases while local inference is running.
- The operator API remains local-only; the setup does not expose it publicly.
- Trial result fields remain untouched until actual demo QA/human review.

## Hosted recovery proofs

The recovery path was proved on the existing Buildkite Linux executor before relying on a replacement user device:

- **Buildkite #540 ✅** — `qwen3:4b` installed and executed for a real strict structured-output smoke after the recovery changes; local-runner extraction regressions passed; `sourceOnly: true` and `verified: false` remained intact.
- **Buildkite #541 ✅** — a brand-new local D1 was migrated and seeded with the locked 20-prospect cohort, Playwright research and local Ollama extraction were run to terminal state, all 20 research jobs completed, every prospect finished with at least one captured source and at least one evidence row, no active or dead-letter research/AI jobs remained, foreign-key violations were zero, and `trialResultsModified` stayed `false`.
- Build #541 also exported a fresh Phase 20 review packet and recovery status as Buildkite artifacts. These are recovery/evidence artifacts only; they are not human verification decisions and do not close the accuracy trial.

The hosted recovery proves that loss of the laptop-local database no longer blocks Phase 20 engineering execution. Human evidence review and actual demo inspection are still mandatory before any trial result can be recorded.

## One-time VPS preparation

After cloning this branch/repository onto the Ubuntu VPS:

```bash
chmod +x scripts/phase20-vps-bootstrap.sh scripts/phase20-vps-init.sh
./scripts/phase20-vps-bootstrap.sh
./scripts/phase20-vps-init.sh
```

The bootstrap script installs/checks Node 22, Python tooling, Playwright Chromium, Ollama, `qwen3:4b`, runs the local-runner tests, and performs a real structured-output smoke test.

The initializer then:

1. creates a private ignored `.env.phase20-vps` runner-token file,
2. applies all local D1 migrations without deleting existing state,
3. installs localhost Phase 20 API and runner systemd services,
4. starts the API,
5. seeds the locked 20 prospects only when the operator D1 is empty,
6. starts the runner,
7. prints the current Phase 20 status.

## Service commands

```bash
sudo systemctl status shalcon-phase20-api.service --no-pager
sudo systemctl status shalcon-phase20-runner.service --no-pager
sudo journalctl -u shalcon-phase20-runner.service -f
curl -fsS http://127.0.0.1:8787/phase20/operator-health
curl -fsS http://127.0.0.1:8787/phase20/status | python3 -m json.tool
```

The service files use the repository's absolute VPS path, so if the repository is later moved, rerun `./scripts/phase20-vps-init.sh` to regenerate them.

## Data-integrity rule

Never copy the old laptop's observed success/failure counts into this fresh VPS D1 as if they were new run results. Historical observations may be kept in notes, but the new workspace must earn its own research, AI, evidence, audit, demo, and correction outcomes.

After research/AI coverage is healthy, continue with Evidence Review and the normal Phase 20 acceptance gate: at least 18 of 20 demos require zero factual correction before send and there are zero critical factual errors.
