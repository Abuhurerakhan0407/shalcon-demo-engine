# Build Status

Current phase: **Phase 10 — ScrapeGraphAI + Ollama**  
Launch progress: **~34%**  
Status: **PHASE 9 CLOSED — PHASE 10 IMPLEMENTATION IN PROGRESS**

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
Strong-key dedupe, weak-match review, conflict handling, canonical observations/decisions, terminal duplicate aliases, operator review UI.

### Phase 6 — Universal Demo Renderer ✅
One `/d/:token` renderer, hashed tokens, exact template-version resolution, D1 config load, expiry/disable, non-enumerating unavailable path, config fail-closed behavior, one deployment serving many businesses.

### Phase 7 — Manual Prospect → Instant Demo Vertical Slice ✅
Verified-fact manual builder, controlled ÉLANE DNA, private preview, safe edits/hiding, config-only regeneration, desktop/mobile preview, disable/fail-closed behavior, evidence mapping and ownership isolation.

### Phase 8 — Local Runner + Job System ✅
Runner registration/token auth, heartbeat, job claim/leases, retries, completion/failure, D1 canonical ledger, queue signalling/reconciliation, dead-letter visibility, offline/crash/restart recovery, cross-operator isolation and token revocation.

### Phase 9 — Playwright Research Engine ✅
Public-only URL validation and DNS/IP safety, standard web-port restriction, Playwright JS-rendered research, same-site discovery, bounded capture/diagnostics/screenshots, service-worker/WebSocket containment, public-only SOCKS5 egress with pinned validated IPs, redirect gating, source-only cloud validation/persistence, job/prospect/requested-URL binding, immutable replay protection, active-lease source writes, long-job renewal, expired-lease rejection, and no automatic promotion to verified facts.

Hosted closure evidence:

- Buildkite Build **#15**
- Commit: `e88318dbb17d662218e77bdff61920f874448342`
- Hosted queue: `linux-small`
- Pipeline upload: ✅
- Full Phase 9 hosted regression: ✅
- Build result: **Passed in 3m 8s**
- Includes typecheck, lint, unit, D1/workerd Phase 1/2/4/5/6/7/8/9 gates, Chromium E2E, Python local-runner tests, production build, and Phase 0–9 audits.

The earlier Android → Termux → Ubuntu/proot ARM64 self-hosted run remains useful supplemental evidence, but Phase 9 closure is based on the clean hosted Buildkite regression above.

## Phase 10 target

Implement the local structured-extraction layer without weakening Phase 9 provenance or the manual path:

- ScrapeGraphAI adapter
- Ollama local provider
- model health check
- structured business extraction schema
- bounded retry/timeout behavior
- safe prompt construction
- agent-run telemetry/log metadata
- malformed model output rejected before persistence
- Ollama-offline behavior fails safely
- source provenance preserved
- optional integration can be disabled without breaking manual prospect/demo workflows

## Phase 10 acceptance gates

- Local model can extract the sample business schema from bounded source content: ⏳
- Structured result is schema validated before completion/persistence: ⏳
- Malformed model output is rejected and never promoted to verified facts: ⏳
- Runner handles Ollama offline/timeout safely with a non-secret error: ⏳
- Provider/model/source provenance is retained in the result: ⏳
- ScrapeGraphAI/Ollama integration can be disabled without breaking the existing manual path: ⏳
- Typecheck/lint/unit/D1/Playwright/Python/build/audits remain green: ⏳

## Current CI condition

GitHub-hosted private-repository allocation remains unavailable on this account, but Buildkite hosted Linux is now the clean zero-cost fallback regression environment for private-repository phase gates. `.buildkite/pipeline.yml` is connected and operational.

## Blocked

No Phase 10 implementation blocker is currently known. A real local Ollama model acceptance run will require an environment with Ollama and an installed model after the code path is implemented and regression-clean.

## Next action

Implement the Phase 10 local AI extraction adapter/provider, add strict tests and audit coverage, run the hosted regression, then perform one real Ollama sample extraction before closing Phase 10.
