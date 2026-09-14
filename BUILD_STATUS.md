# Build Status

Current phase: **Phase 20 — 20-Prospect Salon Accuracy Trial**  
Launch progress: **~65%**  
Status: **PHASE 19 CLOSED — PHASE 20 ACTIVE**

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
Implemented local-runner Playwright visual QA, authenticated lease-bound QA input/completion, desktop/mobile checks, full-page + hero screenshots, artifact provenance, D1 screenshot/QA metadata, overflow/broken-image/console/page-error/CTA/placeholder/disclosure/noindex checks, idempotent QA enqueue, tenant isolation, and guarded `RENDERED → VISUAL_QA_PENDING → FACT_QA_PENDING` or fail-closed `QA_FAILED` progression.

Closure evidence:

- Initial compile: **Buildkite #325 ✅**
- Runner worker contract: **#331 ✅**
- Healthy + broken browser fixtures: **#332 ✅**
- D1 acceptance: **#339 ✅**
- Architecture audit: **#341 ✅**
- Strict regression: **#342 ✅**
- Full Phase 0–18 regression: **#343 ✅**
- Verified commit: `5acc14ac7a9d1cb7a5f0a5e75efeb35ddcc8175b`

### Phase 19 — Fact QA + Sales QA ✅
Implemented evidence-bound visible-fact validation, conflict enforcement, 180-day evidence freshness review policy, CTA correctness checks, deterministic Fact QA results, structured issue/remediation ledger, authenticated evidence/source inspection, explicit human Sales QA, mandatory five-item human checklist, approve/reject decision ledger, tenant/FK guards, and fail-closed state transitions.

Operator QA workspace is active at `/qa` and includes:

- review queue
- supporting evidence/source links
- private demo preview
- Fact QA rerun
- resolve/waive actions with required notes
- human Sales QA checklist
- explicit approve/reject
- visible outreach-disabled guard

Safety properties:

- visual PASS alone cannot become ready;
- unsupported visible critical facts fail;
- wrong CTA fails;
- stale/conflicted evidence can hold review;
- unresolved issues block Sales approval;
- every human checklist item is mandatory;
- explicit rejection fails closed;
- approval may make a demo ready but cannot send outreach;
- later Contact Finder / Outreach Copy / Gmail phases remain required.

Closure evidence:

- Initial Phase-19 compile: **Buildkite #350 ✅**
- Adversarial real-D1 acceptance: **Buildkite #356 ✅**
- Architecture audit: **Buildkite #357 ✅**
- Integration lint correction verified: **Buildkite #364 ✅**
- Operator QA UI + Playwright + audit + production build: **Buildkite #373 ✅**
- Authoritative full Phase 0–19 hosted regression: **Buildkite #374 ✅**
- Final fully verified Phase-19 implementation commit: `c307e326a0ae8a3e994457ca30b525d202cf1907`

## Active — Phase 20: 20-Prospect Salon Accuracy Trial

This is a real-market accuracy gate, not a synthetic fixture exercise.

Run **20 actual Salon & Spa prospects** through the system and record separately:

- wrong identity
- wrong fact
- missing fact
- wrong template
- bad copy
- bad image
- visual bug
- contact problem
- manual correction required

Hard gate:

- at least **18/20 demos require zero factual correction before send**;
- any critical factual error is a failure that must be investigated;
- failures must not be hidden or reclassified as visual/copy problems;
- if the gate fails, stop scaling, fix identity/research/evidence/template logic, and repeat the trial.

Current cohort status:

- the cohort is locked at **20 real Mumbai Salon/Spa prospects**;
- **13** are official-website-led identities and **7** are public-listing-led identities;
- listing-provider domains are not promoted into business identity domains;
- all **20/20** prospects have passed the live research boundary without mutating trial results;
- the locked trial ledger still has `result: null` for every prospect pending genuine end-to-end demo QA.

Phase-20 operator/review infrastructure now proven:

- auditable evidence verification/rejection with immutable review events;
- no automatic promotion of AI evidence to VERIFIED;
- critical scalar conflict guards and multi-value fact-promotion guards;
- dedicated Evidence Review operator UI;
- localhost-only durable operator shell that rejects production mode;
- locked-20 seeder that refuses non-empty/dirty trial workspaces;
- portable review-packet export containing unresolved evidence, conflicts, canonical facts and review history;
- separate local D1 workspaces used for integration and full 20-prospect seed proof;
- Buildkite **#516 ✅** — operator workspace end-to-end proof;
- Buildkite **#519 ✅** — operator workspace + review-packet export proof;
- latest Phase-20 operator proof commit: `9de59a248eb8bfdd16c7c03323574c6007e08c02`.

## Current CI condition

Phase 19 is closed. Buildkite #374 remains the authoritative Phase 0–19 baseline and Phase 20 does not alter that historical result.

Phase-20 operator infrastructure is green through Buildkite #519. Feature-scoped TypeScript/lint/web-build gates, local D1 migrations, operator API integration, locked cohort seeding, FK integrity, trial immutability and review-packet export are proven.

Phase 20 itself is **not closed**. Closure still requires actual evidence review, demo generation/visual/fact/sales QA, and 20 recorded real-market outcomes.

## Blocked

No engineering blocker is known. Phase-20 closure is intentionally waiting on genuine human evidence verification and actual demo inspection; those decisions must not be fabricated by CI or inferred from model output.

## Last fully verified implementation commit

Phase-19 baseline: `c307e326a0ae8a3e994457ca30b525d202cf1907` — authoritative full Phase 0–19 hosted regression, Buildkite #374 SUCCESS.

Phase-20 operator infrastructure proof: `9de59a248eb8bfdd16c7c03323574c6007e08c02` — Buildkite #519 SUCCESS.

## Next action

Run the durable local Phase-20 workspace, let Playwright + Ollama populate the locked cohort, export the review packet, perform human evidence decisions, then run every prospect through audit → scoring → brand/template → content/assets → automated demo → visual QA → Fact QA → human Sales QA. Record all nine correction categories only after each actual demo is inspected, then evaluate the 18/20 factual-accuracy gate before starting Phase 21.
