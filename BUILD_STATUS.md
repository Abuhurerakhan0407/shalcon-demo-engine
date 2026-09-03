# Build Status

Current phase: **Phase 9 — Playwright Research Engine**  
Launch progress: **~29% (Phases 0–8 of 0–30 fully verified)**  
Status: **IN PROGRESS — Phase 8 fully green; Phase 9 implementation starting**

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

## Latest full verification

- Commit: `d7ee30a65e8afa223d29bff370817012089ccca4`
- GitHub Actions run: `33767184933`
- JavaScript: ✅
- Typecheck: ✅
- Lint: ✅
- Unit tests: ✅
- Phase 1 D1: ✅
- Phase 2 D1: ✅
- Phase 4 D1: ✅
- Phase 5 D1: ✅
- Phase 6 D1: ✅
- Phase 7 D1: ✅
- Phase 8 D1: ✅
- Production build: ✅
- Worker smoke: ✅
- Phase 0–8 audits: ✅
- Playwright E2E: ✅
- Python/Pytest: ✅

## Phase 9 scope

- Safe public-URL validation.
- Playwright browser research service in the local runner.
- Browser-rendered page fetch.
- Relevant same-site page discovery.
- Bounded HTML/text extraction.
- Full-page screenshot artifacts.
- Console/network diagnostics.
- Cloud-side source-record persistence.
- SSRF/private-network protections.

## Phase 9 acceptance

- Official-site style fixtures researched.
- JavaScript-rendered content captured.
- Source URLs stored in D1.
- Private-network URLs rejected by production URL policy.
- Failed navigation/HTTP diagnostics visible.
- Research creates source material only; it does not invent or verify business facts.
- Full regression suite remains green.

## Blocked

None currently.

## Next action

Implement Phase 9 strictly to the master acceptance criteria, then run the complete CI suite before starting Phase 10.
