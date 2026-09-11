# Build Status

Current phase: **Phase 14 — Brand Analyzer + Template Matcher**  
Launch progress: **~45%**  
Status: **PHASE 13 CLOSED — PHASE 14 ACTIVE**

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

Implemented:

- deterministic 100-point calculator
- business/niche 20, website need 25, verified data 15, brand signals 10, business-capacity signals 15, contactability 10, recent activity 5
- evidence references required before a component can receive points
- deterministic thresholds: 85+ priority, 70+ generate, 50+ research-more, below 50 reject
- `AUDITED -> SCORED -> DEMO_QUALIFIED | RESEARCH_MORE | REJECTED` enforcement
- immutable D1 score history
- authenticated scoring API and operator scoring workspace
- human-readable component reasons
- AI cannot set or override the numeric total
- rejected prospects cannot advance automatically into demo generation
- real D1/Workerd acceptance and architecture audit

Acceptance gates:

- code calculates score: ✅
- AI cannot override total: ✅
- thresholds enforce states: ✅
- rejected lead cannot generate/send automatically: ✅
- missing evidence reduces score rather than fabricating evidence: ✅
- full hosted regression on latest Phase 13 head: ✅

Final closure evidence:

- Buildkite Build **#191 ✅**
- Commit: `906c4d638acad1452e09b08cab4831c52786d169`
- Hosted queue: `linux-small`
- Full Phase 0–13 regression status: **SUCCESS**

## In progress — Phase 14: Brand Analyzer + Template Matcher

Build:

- evidence-bound brand profile
- controlled theme selection
- registry-only archetype/template selection
- deterministic template eligibility and fit score
- safe default path for unknown brands
- sparse-content compatible layout selection
- selection explanation
- immutable/versioned selection history
- logged human override for a mismatched selection

Acceptance targets:

- selection uses allowed registry only
- unknown brand does not invent palette story
- insufficient content selects compatible layout
- template mismatch can be manually changed
- selection is logged/versioned

## Current CI condition

Buildkite hosted Linux remains the authoritative private-repository phase gate because GitHub-hosted private allocation is unavailable on this account.

## Blocked

None.

## Last verified commit

`906c4d638acad1452e09b08cab4831c52786d169` — final full Phase 13 hosted regression, Buildkite #191 SUCCESS.

## Next action

Implement and validate Phase 14 against the existing evidence layer, deterministic scoring decision, versioned ÉLANE registry and controlled ThemeDNA. Do not infer a brand palette/positioning without source evidence; unknown or sparse prospects must take the safe compatible path.
