# Build Status

Current phase: **Phase 17 — Automated Demo Builder**  
Launch progress: **~55%**  
Status: **PHASE 16 CLOSED — PHASE 17 ACTIVE**

## Completed phases

### Phase 0 — Repository + Engineering Foundation ✅
Monorepo, React/Vite/TypeScript, Hono/Cloudflare Worker, Python runner foundation, strict tooling, tests, CI and architecture docs.

### Phase 1 — Data Layer + State Machine ✅
D1 schema/repositories, deterministic prospect state machine, idempotent job ledger, leases, audit events and live-D1 verification.

### Phase 2 — Authentication + Dashboard Shell ✅
Google OAuth architecture, stable Google subject identity, hashed/revocable sessions, protected responsive dashboard and browser/runtime checks.

### Phase 3 — Salon Template v1 / ÉLANE v8 ✅
Versioned ÉLANE v8 Salon & Spa template, deterministic adapter/runtime, noindex/disclosure, sparse-data fallbacks and desktop/mobile QA.

### Phase 4 — Prospect + Evidence Core ✅
Prospect CRUD/manual entry, immutable source records, evidence candidates, canonical facts, verification provenance and conflict/provenance UI.

### Phase 5 — Identity Resolution + Deduplication ✅
Strong-key dedupe, weak-match review, conflict handling, canonical observations/decisions, terminal duplicate aliases and operator review UI.

### Phase 6 — Universal Demo Renderer ✅
One `/d/:token` renderer, hashed tokens, exact template-version resolution, D1 config load, expiry/disable and fail-closed behavior.

### Phase 7 — Manual Prospect → Instant Demo Vertical Slice ✅
Verified-fact manual builder, controlled ÉLANE DNA, private preview, safe edits/hiding, config-only regeneration and mobile/desktop preview.

### Phase 8 — Local Runner + Job System ✅
Runner auth/heartbeat, canonical D1 job ledger, leases, retries, reconciliation, dead-letter visibility and crash/offline recovery.

### Phase 9 — Playwright Research Engine ✅
Public-only browser research with SSRF/egress controls, bounded capture, source-only persistence, active-lease writes and replay protection. Final hosted closure: **Buildkite #15 ✅**.

### Phase 10 — ScrapeGraphAI + Ollama ✅
Local Ollama extraction, strict schema validation, provenance, safe failures and real ARM64 local-model acceptance. Final hosted closure: **Buildkite #53 ✅**.

### Phase 11 — Automated Research + Evidence ✅
Page prioritization, per-source extraction, candidate grounding, confidence/conflicts, research history, operator UI and no silent canonical-fact promotion. Final hosted closure: **Buildkite #123 ✅**.

### Phase 12 — Website Opportunity Audit ✅
Evidence-backed mobile/desktop audit, screenshots, CTA/contact/booking/service checks, deterministic site-quality recommendation and repeatable history. Final hosted closure: **Buildkite #167 ✅**, commit `1532e3cfd716eacdce03e2d450d7826a22d7ddd2`.

### Phase 13 — Demo Worthiness Scoring ✅
Deterministic 100-point score, evidence-linked components, threshold-enforced transitions, score history and operator workspace. Final hosted closure: **Buildkite #191 ✅**, commit `906c4d638acad1452e09b08cab4831c52786d169`.

### Phase 14 — Brand Analyzer + Template Matcher ✅
Evidence-bound brand profiles, controlled ThemeDNA, registry-only template selection, deterministic fit scoring, safe defaults, sparse-content handling and versioned/manual override history. Final original closure: **Buildkite #235 ✅**. Phase-16 compatibility fixture reverified: **Buildkite #282 ✅**.

### Phase 15 — Content Engine ✅
Verified-only content selection, safe headline/service/about/CTA generation, safe fallbacks, strict copy schema, evidence mapping, prompt/model/schema provenance and immutable generation history. Final hosted closure: **Buildkite #251 ✅**, commit `be9f91660d7356518ebdea75adc9d82654d6ef59`.

### Phase 16 — Asset Engine ✅

Implemented:

- Shalcon-owned/licensed template asset registry
- asset metadata and provenance
- official prospect logo eligibility rules
- text-wordmark fallback
- deterministic HERO/SERVICE/GALLERY assignment
- explicit asset usage classification
- broken/unusable asset rejection
- bounded image-dimension optimization metadata
- immutable asset-selection history
- authenticated asset registry/history/run API
- database guards for official-source association, capture metadata, watermark state and asset health

Acceptance gates:

- no random third-party image reuse: ✅
- no watermarked official assets: ✅
- missing logo falls back safely: ✅
- template imagery is never represented as prospect reality: ✅
- source metadata available for external official assets: ✅
- typecheck/lint/unit: ✅
- D1/Workerd Phase-16 acceptance: ✅ — Buildkite #260
- Phase-16 architecture audit: ✅ — Buildkite #261
- E2E/Python/build regression checks: ✅ — Buildkite #273/#274/#275
- full hosted Phase 0–16 regression: ✅ — Buildkite #283

Final closure evidence:

- Buildkite Build **#283 ✅**
- Commit: `006a55ec61aff04ce9015362e70de877bee32d0e`
- Hosted queue: `linux-small`
- Full Phase 0–16 regression status: **SUCCESS**
- Phase-14 legacy fixture was updated to comply with Phase-16 `PROSPECT_OFFICIAL` provenance invariants; production provenance rules were not weakened.

## In progress — Phase 17: Automated Demo Builder

Build:

- deterministic automated builder orchestration
- qualified-prospect dependency validation
- latest compatible research/brand/template/content/asset inputs
- one config-only build path into the existing universal renderer
- exact template/version preservation
- private preview URL generation
- immutable automated-build provenance/history
- ownership/concurrency/idempotency protections
- safe failure on stale/missing/unsupported inputs
- deterministic prospect-state progression through demo configuration/rendering

Acceptance targets:

From one qualified prospect, one command/job must produce:

- valid demo config
- rendered private URL
- correct template/version
- no per-prospect code changes
- no per-prospect deployment
- no unsupported critical field
- no bypass of Phase-18/19 QA/send gates

## Current CI condition

Buildkite hosted Linux remains the authoritative private-repository phase gate because GitHub-hosted private allocation is unavailable on this account. During Phase 17 development, incremental commits run strict TypeScript, lint and unit tests; Phase 17 will not close until its D1/Workerd acceptance, architecture audit and full Phase 0–17 hosted regression are green.

## Blocked

None.

## Last fully verified commit

`006a55ec61aff04ce9015362e70de877bee32d0e` — final full Phase 0–16 hosted regression, Buildkite #283 SUCCESS.

## Next action

Implement Phase 17 as an orchestrator over existing Phase 14–16 outputs and the existing universal renderer. Do not generate arbitrary website code, deploy per prospect, loosen provenance, or expose an unverified critical fact. Keep QA/send readiness for later Phase 18/19 gates.
