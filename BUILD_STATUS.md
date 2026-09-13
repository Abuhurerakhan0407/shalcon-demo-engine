# Build Status

Current phase: **Phase 18 — Visual QA + Screenshot Package**  
Launch progress: **~58%**  
Status: **PHASE 17 CLOSED — PHASE 18 ACTIVE**

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
Shalcon-owned/licensed template asset registry, official prospect-logo eligibility, text-wordmark fallback, deterministic image-slot assignment, provenance/usage classification, broken/watermarked asset rejection, optimization metadata and immutable asset-selection history.

Final closure evidence:

- Buildkite **#283 ✅**
- Commit: `006a55ec61aff04ce9015362e70de877bee32d0e`
- Full Phase 0–16 hosted regression: **SUCCESS**
- Phase-14 legacy fixture updated for Phase-16 provenance invariants without weakening production rules.

### Phase 17 — Automated Demo Builder ✅

Implemented:

- deterministic orchestration over Phase 14–16 outputs
- latest compatible template/content/asset dependency validation
- strict stale-input rejection
- existing universal renderer/config path reuse
- exact ÉLANE v8 template/version preservation
- private operator preview generation
- immutable automated-build provenance/history
- tenant ownership checks
- fingerprint-based idempotent reuse
- fail-closed handling for missing dependencies
- guarded `CONTENT_PENDING → DEMO_CONFIGURED → RENDER_PENDING → RENDERED` progression
- Phase-18/19 QA holds preserved; no public-release bypass

Phase-17 repair/verification evidence:

- Config/render isolation: **Buildkite #308 ✅**
- D1 batch state truth: **Buildkite #310 ✅**
- Fixed automated build transaction: **Buildkite #311 ✅**
- Typecheck/lint/unit: **Buildkite #312 ✅**
- Full Phase-17 D1 acceptance: **Buildkite #313 ✅**
- Phase-17 architecture audit: **Buildkite #314 ✅**
- First full regression attempt #315 failed because its CI harness omitted the known-good Python runner + Playwright browser setup; no product rule was weakened to address it.
- Corrected authoritative full Phase 0–17 regression: **Buildkite #316 ✅**
- Final fully verified commit: `006902486d73afa0ef5f0c7e1f204e1099d8db4b`

Root cause fixed during closure:

- D1 batch statements and state transitions were committing correctly, but the builder treated per-statement `meta.changes === 1` as authoritative.
- D1 metadata can differ in batched statements with triggers, causing a false failure even when persisted database state is correct.
- The builder now keeps the guarded transactional batch, requires statement success, then verifies authoritative persisted demo, build provenance and final prospect state before accepting the transaction.

## In progress — Phase 18: Visual QA + Screenshot Package

Build:

- Playwright desktop QA
- Playwright mobile QA
- full-page screenshot
- hero screenshot
- broken-image detection
- horizontal-overflow detection
- console/page-error detection
- CTA validation
- placeholder detection
- disclosure/noindex validation
- stored QA results and screenshot references
- golden ÉLANE regression coverage
- fail-closed QA state progression

Acceptance targets:

- deliberately broken fixtures fail
- correct fixture passes
- screenshot assets are stored/referenced
- QA failure blocks later send readiness
- desktop and mobile checks both pass for a healthy demo
- golden template regression remains green

## Current CI condition

Buildkite hosted Linux remains the authoritative private-repository phase gate. Phase 18 must not close until its targeted Playwright/QA acceptance, D1/storage acceptance as applicable, architecture audit, strict typecheck/lint/unit/build checks and full Phase 0–18 hosted regression are green.

## Blocked

None.

## Last fully verified commit

`006902486d73afa0ef5f0c7e1f204e1099d8db4b` — final full Phase 0–17 hosted regression, Buildkite #316 SUCCESS.

## Next action

Implement Phase 18 by extending the existing Playwright/template/demo QA foundations. Reuse the existing universal renderer and `demo_qa_runs` model. Do not create a parallel renderer, bypass authentication/ownership, weaken noindex/disclosure rules, or allow a failed visual QA result to advance toward send readiness.
