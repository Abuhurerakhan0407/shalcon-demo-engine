# Build Status

Current phase: **Phase 9 — Playwright Research Engine**  
Launch progress: **~31%**  
Status: **IMPLEMENTED + SECURITY/RELIABILITY-HARDENED — strict hosted Phase 9 verification still pending**

## Completed phases

### Phase 0 — Repository + Engineering Foundation ✅
Monorepo, React/Vite/TypeScript, Hono/Cloudflare Worker, Python runner foundation, strict tooling, tests, CI, docs.

### Phase 1 — Data Layer + State Machine ✅
D1 schema/repositories, deterministic prospect state machine, idempotent job ledger, leases, audit events, live-D1 verification.

### Phase 2 — Authentication + Dashboard Shell ✅
Google OAuth architecture, stable Google subject identity, hashed/revocable sessions, protected responsive dashboard, CORS/runtime/browser tests.

### Phase 3 — Salon Template v1 / ÉLANE v8 ✅
User-provided ÉLANE v8 preserved by fingerprint, deterministic adapter/runtime, `elane-v8@8.0.0`, noindex/disclosure, sparse-data fallbacks, desktop/mobile browser QA.

### Phase 4 — Prospect + Evidence Core ✅
Prospect CRUD/manual entry, immutable source records, evidence candidates, canonical facts, DB-enforced verification provenance, conflict/provenance operator UI.

### Phase 5 — Identity Resolution + Deduplication ✅
Strong-key dedupe, weak-match review, conflict handling, canonical observations/decisions, terminal duplicate aliases, operator review UI, live-D1 identity acceptance.

### Phase 6 — Universal Demo Renderer ✅
One `/d/:token` renderer, hashed tokens, exact template-version resolution, D1 config load, expiry/disable, non-enumerating unavailable path, config fail-closed behavior, one deployment serving many businesses.

### Phase 7 — Manual Prospect → Instant Demo Vertical Slice ✅
Verified-fact manual builder, controlled ÉLANE DNA, private preview, safe edits/hiding, config-only regeneration, desktop/mobile preview, disable/fail-closed behavior, evidence mapping and ownership isolation.

### Phase 8 — Local Runner + Job System ✅
Runner registration/token auth, heartbeat, job claim/leases, retries, completion/failure, D1 canonical ledger, queue signalling/reconciliation, dead-letter visibility, offline/crash/restart recovery, cross-operator isolation and token revocation.

## Last fully verified hosted baseline

- Commit: `d7ee30a65e8afa223d29bff370817012089ccca4`
- GitHub Actions run: `33767184933`
- JavaScript/typecheck/lint/unit/D1/build/Worker/Playwright/Python gates: ✅ through Phase 8

## Phase 9 implementation

- Public HTTP(S) URL validator with DNS/IP safety checks: ✅
- Standard web-port restriction (80/443): ✅
- Local Playwright browser research service: ✅
- JavaScript-rendered page capture and same-site discovery: ✅
- Bounded HTML/text, screenshots, console/network diagnostics: ✅
- Per-request browser route safety guard: ✅
- Service Workers blocked and WebSockets disconnected: ✅
- Public-only SOCKS5 egress gate: ✅
- DNS connection pinned to exact validated public IP: ✅
- Chromium loopback/link-local proxy bypass explicitly removed: ✅
- Redirect traffic forced through the public-only egress gate: ✅
- Cloud-side bounded source-only result validation/persistence: ✅
- Cloud result bound to the claimed job/prospect and original requested URL: ✅
- Malformed research completion rejected before persistence: ✅
- Job-context ownership checked before source writes: ✅
- Retry-safe immutable source replay and identity-collision rejection: ✅
- Source writes atomically require the runner's still-active lease: ✅
- Long-running job lease renewal while Playwright executes: ✅
- Terminal runner writes reject expired leases: ✅
- No Phase 9 promotion to evidence or verified facts: ✅
- Real-D1 Phase 9 acceptance fixture and permanent audit/CI wiring: ✅

## Phase 9 mobile self-hosted verification

GitHub Actions run `34259171162` executed on the Android → Termux → Ubuntu/proot ARM64 self-hosted runner at commit `b064578e21f3bce1a12df8707f0e7fa878338b3b`.

Substantive gates completed green:

- Node/Python dependency setup + Playwright browser installation: ✅
- Typecheck: ✅
- Lint: ✅
- Unit tests: ✅
- Chromium browser E2E: ✅
- Python local-runner tests: ✅
- Production web + Worker dry-run build: ✅
- Phase 0–9 static audits: ✅

D1/workerd gates are intentionally **not counted as passed** on this Android/proot runner. `workerd` is not viable in this environment, so the D1 Phase 1/2/4/5/6/7/8/9 steps remain visibly skipped here. At the time this status was recorded, GitHub's post-job Node cache cleanup was still in progress after all substantive steps had completed successfully.

## Phase 9 acceptance state

- Implementation/security/reliability work: ✅
- Strong self-hosted non-D1 regression: ✅
- Full clean hosted regression including D1/workerd: ⏳ pending

## Current CI condition

GitHub-hosted private-repository jobs continue to terminate before checkout because no hosted runner is allocated. Public-repository control runs receive GitHub-hosted runners normally, so product code must not be changed to work around this account/platform allocation issue.

A zero-cost hosted fallback is prepared in `.buildkite/pipeline.yml`. It targets Buildkite's hosted `linux-small` queue and runs the permanent `npm run test:phase9` gate, including the D1/workerd checks that the Android/proot runner cannot execute. Connecting the private GitHub repository to Buildkite requires operator authorization in the Buildkite/GitHub UI.

## Blocked

- Final Phase 9 closure requires one clean hosted complete regression including D1/workerd.
- Do not start Phase 10 until that gate is green.

## Next action

Authorize the private repository in Buildkite and run the prepared hosted Phase 9 pipeline. If it exposes a real code failure, fix the root cause and rerun. If the complete hosted gate is green, mark Phase 9 complete and proceed to Phase 10 — ScrapeGraphAI + Ollama.
