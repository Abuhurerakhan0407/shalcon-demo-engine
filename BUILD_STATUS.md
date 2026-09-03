# Build Status

Current phase: **Phase 5 — Identity Resolution + Deduplication**  
Status: **IN PROGRESS — Phase 4 fully verified; Phase 5 implementation starting**

## Completed

### Phase 0 — Repository + Engineering Foundation

- Engineering foundation and CI baseline: ✅

### Phase 1 — Data Layer + State Machine

- D1 schema, repositories, state machine, idempotency, live D1 verification: ✅

### Phase 2 — Authentication + Dashboard Shell

- Secure Google OAuth architecture, stable provider-subject identity binding, hashed/revocable D1 sessions, protected responsive dashboard, CORS and browser/runtime tests: ✅
- Verified Phase 2 commit: `41facc71fceb3ab004c55a10ff747ca98bf28fdc`.

### Phase 3 — Salon Template v1 / ÉLANE v8

- User-provided ÉLANE v8 is the canonical Salon & Spa visual master.
- Original template source is preserved losslessly and enforced by SHA-256 fingerprint.
- Runtime source is fingerprinted and regenerated deterministically during install/build.
- Adapter adds only engine hooks, noindex/disclosure, safe config injection, and evidence-safe hiding.
- Template registry/versioning: `elane-v8@8.0.0`.
- Long, short, and minimal evidence fixtures are implemented.
- Unsupported services/process/space/reviews/FAQ/contact facts hide or disable rather than being invented.
- Browser tests cover cinematic sections, finder personalization, sparse-data fallbacks, booking safety, mobile overflow, and retained screenshots.
- Full clean GitHub Actions run `33742603033` is green on commit `8b15eee16cc62e69c709714ba7cb7cad65ae3c0d`.

### Phase 4 — Prospect + Evidence Core

- Prospect CRUD and manual Salon & Spa prospect entry: ✅
- Source records and immutable evidence candidates: ✅
- Canonical prospect facts with verification status/confidence: ✅
- Database-enforced verified-fact provenance: ✅
- Cross-prospect evidence rejection: ✅
- Source quality + field conflict summaries: ✅
- Evidence/provenance operator UI: ✅
- Manual-create selection race fixed at query-cache boundary: ✅
- Full clean GitHub Actions run `33744432744` is green on commit `38a640805b04c23d5603e142a1a77c4e926fbe5e`.

## Phase 4 acceptance

- Every factual field can map to evidence: ✅
- Unsupported fields cannot be marked verified without matching evidence: ✅
- Cross-prospect and wrong-field evidence are rejected by D1: ✅
- Conflict display works: ✅
- Source provenance is visible: ✅
- Typecheck/lint/unit: ✅
- Phase 1/2/4 real D1 integration: ✅
- Production build + Worker smoke: ✅
- Phase 0/1/2/3/4 audits: ✅
- Playwright prospect/evidence + ÉLANE regressions: ✅
- Python regression: ✅

## Phase 5 scope

- Deterministic identity keys for normalized domain, phone, name + city, and address + city.
- One canonical prospect per real business per operator.
- Exact strong-identifier dedupe before a new canonical prospect is created.
- Ambiguous/composite matches go to review; they never silently merge.
- Conflicting strong identifiers stop in identity review.
- Discovery/entry observations remain auditable even when deduplicated.
- Identity resolution records store candidates, reason codes, confidence, and outcome.
- Canonical prospect identity can progress from `NORMALIZED` → `IDENTITY_PENDING` → `IDENTITY_VERIFIED` only after deterministic resolution.
- Existing evidence/source provenance must never be reassigned across businesses by a merge shortcut.
- Operator UI must show duplicate/review outcomes clearly.

## Phase 5 acceptance

- Same normalized domain cannot create two canonical prospects for one operator.
- Same normalized phone cannot create two canonical prospects for one operator.
- Name + city alone never auto-merges.
- Conflicting domain/phone candidates require review.
- Deduplicated observations are recorded against the canonical prospect.
- Identity decisions are explainable and auditable.
- Real D1 integration tests prove exact-match, ambiguous, conflict, and no-match behavior.
- Full regression suite remains green.

## Blocked

None currently.

## Next action

Implement Phase 5 identity keys, resolver, canonicalization, audit trail, API/UI behavior, then run the complete regression suite before starting Phase 6.
