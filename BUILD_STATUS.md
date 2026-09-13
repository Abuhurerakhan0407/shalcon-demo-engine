# Build Status

Current phase: **Phase 19 — Fact QA + Sales QA**  
Launch progress: **~61%**  
Status: **PHASE 18 CLOSED — PHASE 19 ACTIVE**

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

### Phase 17 — Automated Demo Builder ✅
Deterministic orchestration over Phase 14–16 outputs; stale-input rejection; universal-renderer reuse; exact ÉLANE version preservation; private preview; immutable provenance; tenant checks; idempotency; guarded `CONTENT_PENDING → DEMO_CONFIGURED → RENDER_PENDING → RENDERED`; Phase-18/19 QA holds preserved.

Closure evidence:

- Config/render isolation: **Buildkite #308 ✅**
- D1 batch state truth: **Buildkite #310 ✅**
- Fixed automated build transaction: **Buildkite #311 ✅**
- Typecheck/lint/unit: **Buildkite #312 ✅**
- D1 acceptance: **Buildkite #313 ✅**
- Architecture audit: **Buildkite #314 ✅**
- Corrected full Phase 0–17 regression: **Buildkite #316 ✅**
- Verified commit: `006902486d73afa0ef5f0c7e1f204e1099d8db4b`

### Phase 18 — Visual QA + Screenshot Package ✅

Implemented:

- local-runner Playwright visual-QA job capability
- authenticated, lease-bound QA input and completion APIs
- desktop and mobile browser checks
- desktop full-page screenshot
- desktop hero screenshot
- mobile full-page screenshot
- mobile hero screenshot
- local-runner artifact references with SHA-256 provenance
- D1 screenshot metadata and QA-run provenance
- horizontal-overflow detection
- broken-image detection
- console-error detection
- page-error detection
- CTA detection
- placeholder detection
- concept-disclosure validation
- noindex/nofollow validation
- idempotent QA enqueue
- tenant isolation and runner ownership guards
- PASS progression: `RENDERED → VISUAL_QA_PENDING → FACT_QA_PENDING`
- FAIL progression: `RENDERED → VISUAL_QA_PENDING → QA_FAILED`
- visual failure blocks later fact/sales/send readiness
- public release remains unavailable after visual PASS
- existing universal renderer reused; no parallel renderer and no per-prospect deployment

Acceptance evidence:

- Phase-18 initial TypeScript/control-plane compile: **Buildkite #325 ✅**
- Runner worker contract: **Buildkite #331 ✅**
- Browser healthy + deliberately broken fixtures: **Buildkite #332 ✅**
- Phase-18 acceptance typecheck after D1 worker integration: **Buildkite #337 ✅**
- Full Phase-18 D1/Workerd acceptance: **Buildkite #339 ✅**
- Phase-18 architecture audit: **Buildkite #341 ✅**
- Strict regression — typecheck/lint/unit/E2E/Python/build + golden ÉLANE coverage: **Buildkite #342 ✅**
- Authoritative full Phase 0–18 hosted regression: **Buildkite #343 ✅**
- Final fully verified implementation commit: `5acc14ac7a9d1cb7a5f0a5e75efeb35ddcc8175b`

Important Phase-18 safety properties:

- one healthy demo produces exactly four screenshot records and advances only to `FACT_QA_PENDING`;
- a deliberately broken visual result fails closed to terminal `QA_FAILED`;
- QA artifacts remain local-runner files with D1 metadata references for the free-first MVP; PNG blobs are not stuffed into D1 and no paid storage dependency was introduced;
- screenshot metadata is bound to the QA run/demo through FK and trigger guards;
- runner completion is accepted only from the active lease owner;
- another tenant cannot read the QA history;
- no visual PASS can skip Phase 19 or become send-ready.

## In progress — Phase 19: Fact QA + Sales QA

Build:

- fact-to-evidence validation for every visible critical field
- conflict enforcement
- evidence freshness/review policy
- quality checklist
- human approval queue
- issue/remediation records
- operator inspection of supporting sources
- CTA correctness validation
- sales-readiness checklist
- deterministic PASS/FAIL outcome
- guarded `FACT_QA_PENDING → SALES_QA_PENDING → DEMO_READY` progression only after required approvals
- fail-closed path to `QA_FAILED` for unsupported/wrong critical facts or sales QA failure

Acceptance targets:

- one unsupported visible critical fact fails the demo
- wrong CTA fails
- expired/stale evidence can force review
- human can inspect sources supporting visible claims
- visual QA PASS alone is insufficient for readiness
- only fully passing fact + sales QA can become `DEMO_READY`
- tenant ownership and audit history remain intact
- no autonomous send or negotiation is introduced in Phase 19

## Current CI condition

Buildkite hosted Linux remains the authoritative private-repository phase gate. Phase 19 must not close until targeted fact/sales QA acceptance, D1/state-machine acceptance, architecture audit, strict typecheck/lint/unit/build checks and full Phase 0–19 hosted regression are green.

## Blocked

None.

## Last fully verified implementation commit

`5acc14ac7a9d1cb7a5f0a5e75efeb35ddcc8175b` — final full Phase 0–18 hosted regression, Buildkite #343 SUCCESS.

## Next action

Implement Phase 19 on top of the verified Phase-18 visual PASS state. Reuse canonical facts/evidence and existing demo QA/history models. Do not allow unsupported visible critical facts, stale/conflicted evidence, a wrong CTA, or a failed human/sales checklist to advance to `DEMO_READY`. Do not introduce outreach sending in this phase.
