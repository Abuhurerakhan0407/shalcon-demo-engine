# Build Status

Current phase: **Phase 9 — Playwright Research Engine**  
Launch progress: **~31%**  
Status: **IMPLEMENTED + SECURITY/RELIABILITY-HARDENED — final Phase 9 verification pending a runnable GitHub Actions job**

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

## Last fully verified baseline

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
- Retry-safe immutable source replay and identity-collision rejection: ✅
- Long-running job lease renewal while Playwright executes: ✅
- No Phase 9 promotion to evidence or verified facts: ✅
- Real-D1 Phase 9 acceptance fixture and permanent audit/CI wiring: ✅

## Phase 9 acceptance state

- Implementation/security/reliability work: ✅
- Full clean CI regression: ⏳ pending runnable hosted job

## Current CI condition

Run `33772408453` demonstrated the current external failure mode: every `ubuntu-latest` job ended before checkout with `steps: []`, `runner_id: 0`, and no runner name. Subsequent Phase 9 changes remain unverified by hosted CI until GitHub allocates a runner normally. This is not treated as a passing product gate.

## Blocked

- Final Phase 9 closure requires one clean runnable GitHub Actions regression. Do not start Phase 10 until that gate is green.

## Next action

As soon as a hosted runner is allocated, run the complete regression. Fix any real failure before Phase 10; otherwise mark Phase 9 complete and proceed to Phase 10 — ScrapeGraphAI + Ollama.
