# Build Status

Current phase: **Phase 4 — Prospect + Evidence Core**  
Status: **IN PROGRESS — Phase 3 fully verified; Phase 4 implementation starting**

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

## Phase 3 acceptance

- Source fingerprint: ✅
- Runtime fingerprint: ✅
- Typecheck: ✅
- Lint: ✅
- Unit: ✅
- Phase 1 D1 regression: ✅
- Phase 2 D1 regression: ✅
- Build: ✅
- Worker smoke: ✅
- Phase 0/1/2/3 audits: ✅
- Playwright desktop/mobile/sparse-data/finder tests: ✅
- Python regression: ✅
- Visual screenshot artifacts retained: ✅
- User visual approval of the ÉLANE master template: ✅

## Phase 4 scope

- Prospect CRUD.
- Manual prospect entry.
- Source records.
- Evidence model.
- Verified fields.
- Source quality.
- Confidence.
- Conflicts.
- Evidence UI.
- Normalization.

## Phase 4 acceptance

- Every factual field can map to evidence.
- Unsupported fields cannot be marked verified without evidence.
- Conflict display works.
- Source provenance is visible.
- Unit and real D1 integration tests pass.

## Blocked

None currently.

## Next action

Implement Phase 4 strictly to the master contract, then run the complete regression suite before starting Phase 5.
