# Build Status

Current phase: **Phase 3 — Salon Template v1 / ÉLANE v8 integration**  
Status: **IN PROGRESS — ÉLANE v8 replacement committed; clean CI verification pending**

## Completed

### Phase 0 — Repository + Engineering Foundation

- Engineering foundation and CI baseline: ✅

### Phase 1 — Data Layer + State Machine

- D1 schema, repositories, state machine, idempotency, live D1 verification: ✅

### Phase 2 — Authentication + Dashboard Shell

- Secure Google OAuth architecture, stable provider-subject identity binding, hashed/revocable D1 sessions, protected responsive dashboard, CORS and browser/runtime tests: ✅
- Last fully verified Phase 2 commit: `41facc71fceb3ab004c55a10ff747ca98bf28fdc`.

## Phase 3 — ÉLANE v8

- User-provided ÉLANE v8 is the canonical Salon & Spa visual master.
- Original template source preserved losslessly and fingerprinted.
- Runtime source preserved and fingerprinted.
- Deterministic generator adds only engine hooks; it does not redesign the template.
- Template registry/versioning updated to `elane-v8@8.0.0`.
- Prospect config is injected through safe DOM/runtime operations rather than generated website code.
- Long, short, and minimal evidence fixtures implemented.
- Unsupported services/process/space/reviews/FAQ/contact facts hide or disable rather than being invented.
- Public QA preview renders the canonical ÉLANE document in an iframe.
- Browser tests cover cinematic sections, finder personalization, sparse-data fallbacks, booking safety, mobile overflow, and retained screenshots.

## Phase 3 acceptance

- Source fingerprint: pending clean CI.
- Runtime fingerprint: pending clean CI.
- Typecheck/lint/unit: pending clean CI.
- Prior Phase 1/2 D1 regressions: pending clean CI.
- Build/Worker smoke/audits: pending clean CI.
- ÉLANE desktop/mobile Playwright: pending clean CI.
- Visual screenshot inspection: pending clean CI artifact.

## Blocked

None currently.

## Next action

Run the complete clean CI gate on the final ÉLANE v8 state, fix every failure, inspect screenshots, then close Phase 3 before Phase 4 begins.
