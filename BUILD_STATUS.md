# Build Status

Current phase: **Phase 15 — Content Engine**  
Launch progress: **~48%**  
Status: **PHASE 14 CLOSED — PHASE 15 ACTIVE**

## Completed phases

### Phase 0 — Repository + Engineering Foundation ✅
Monorepo, React/Vite/TypeScript, Hono/Cloudflare Worker, Python runner foundation, strict tooling, tests, CI, docs.

### Phase 1 — Data Layer + State Machine ✅
D1 schema/repositories, deterministic prospect state machine, idempotent job ledger, leases, audit events, live-D1 verification.

### Phase 2 — Authentication + Dashboard Shell ✅
Google OAuth architecture, stable Google subject identity, hashed/revocable sessions, protected responsive dashboard, CORS/runtime/browser tests.

### Phase 3 — Salon Template v1 / ÉLANE v8 ✅
Versioned ÉLANE v8 Salon & Spa template, deterministic adapter/runtime, noindex/disclosure, sparse-data fallbacks, desktop/mobile QA.

### Phase 4 — Prospect + Evidence Core ✅
Prospect CRUD/manual entry, immutable source records, evidence candidates, canonical facts, verification provenance, conflict/provenance UI.

### Phase 5 — Identity Resolution + Deduplication ✅
Strong-key dedupe, weak-match review, conflict handling, canonical observations/decisions, terminal duplicate aliases, operator review UI.

### Phase 6 — Universal Demo Renderer ✅
One `/d/:token` renderer, hashed tokens, exact template-version resolution, D1 config load, expiry/disable and fail-closed behavior.

### Phase 7 — Manual Prospect → Instant Demo Vertical Slice ✅
Verified-fact manual builder, controlled ÉLANE DNA, private preview, safe edits/hiding, config-only regeneration, mobile/desktop preview.

### Phase 8 — Local Runner + Job System ✅
Runner auth/heartbeat, canonical D1 job ledger, leases, retries, reconciliation, dead-letter visibility, crash/offline recovery.

### Phase 9 — Playwright Research Engine ✅
Public-only browser research with SSRF/egress controls, bounded capture, source-only persistence, active-lease writes and replay protection. Final hosted closure: **Buildkite #15 ✅**.

### Phase 10 — ScrapeGraphAI + Ollama ✅
Local Ollama extraction, strict schema validation, provenance, safe failures and real ARM64 local-model acceptance. Final latest-head hosted closure: **Buildkite #53 ✅**.

### Phase 11 — Automated Research + Evidence ✅
Page prioritization, per-source extraction, candidate grounding, confidence/conflicts, research history, operator UI and no silent canonical-fact promotion. Final hosted closure: **Buildkite #123 ✅**.

### Phase 12 — Website Opportunity Audit ✅
Evidence-backed mobile/desktop audit, screenshots, CTA/contact/booking/service checks, deterministic site-quality recommendation and repeatable history. Final hosted closure: **Buildkite #167 ✅**, commit `1532e3cfd716eacdce03e2d450d7826a22d7ddd2`.

### Phase 13 — Demo Worthiness Scoring ✅
Deterministic 100-point score, evidence-linked components, threshold-enforced transitions, score history and operator workspace. Final hosted closure: **Buildkite #191 ✅**, commit `906c4d638acad1452e09b08cab4831c52786d169`.

### Phase 14 — Brand Analyzer + Template Matcher ✅

Implemented:

- evidence-bound brand profiles
- controlled ThemeDNA selection
- registry-only archetype/template selection
- deterministic template eligibility and fit score
- safe default path for unknown brands
- sparse-content compatible layout selection
- selection explanation
- immutable/versioned selection history
- logged human override with supersession lineage
- authenticated brand/template API
- D1 acceptance and architecture audit

Acceptance gates:

- selection uses allowed registry only: ✅
- unknown brand does not invent palette story: ✅
- insufficient content selects compatible layout: ✅
- template mismatch can be manually changed: ✅
- selection is logged/versioned: ✅
- full hosted Phase 0–14 regression: ✅

Final closure evidence:

- Buildkite Build **#235 ✅**
- Commit: `fed7c83852af630a1cc4398aa59cef4b4d5ce107`
- Hosted queue: `linux-small`
- Full Phase 0–14 regression status: **SUCCESS**

## In progress — Phase 15: Content Engine

Build:

- verified-only input selector
- safe headline generator
- service-description generator
- about-copy generator
- CTA generator with safe placeholder fallback
- strict generated-copy schema
- block-level and run-level evidence mapping
- prompt/model/version provenance
- immutable D1 content-generation history
- authenticated content API
- safe missing-data hiding
- long business/service-name handling

Acceptance targets:

- no unsupported claims
- no invented service
- no invented social proof
- missing data hides safely
- generated copy stores source evidence IDs
- long business/service names are handled safely

## Current CI condition

Buildkite hosted Linux remains the authoritative private-repository phase gate because GitHub-hosted private allocation is unavailable on this account.

## Blocked

None.

## Last verified commit

`fed7c83852af630a1cc4398aa59cef4b4d5ce107` — final full Phase 14 hosted regression, Buildkite #235 SUCCESS.

## Next action

Validate the Phase 15 content engine with strict TypeScript/lint/unit tests, D1/Workerd acceptance, architecture audit, then run the full Phase 0–15 hosted regression. Do not let unverified evidence or generated marketing claims enter prospect copy.
