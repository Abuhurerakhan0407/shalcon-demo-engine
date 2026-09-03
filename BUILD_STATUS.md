# Build Status

Current phase: **Phase 3 — Salon Template v1**  
Status: **IN PROGRESS — Phase 2 fully verified; Phase 3 implementation staged for clean CI**

## Completed

### Phase 0 — Repository + Engineering Foundation

- Monorepo/workspace, React frontend, Hono Worker backend, Python runner skeleton, shared packages, strict TypeScript, ESLint, Prettier, Vitest, Playwright, Pytest, environment baseline, architecture docs, and CI are green.

### Phase 1 — Data Layer + State Machine

- D1 initial migration and typed repositories implemented.
- Prospect state machine, audit trail, retries, leases, dead-letter behavior, and deterministic idempotency implemented.
- Fresh/repeated migrations, real D1 integration, typecheck, lint, unit, build, Worker smoke, Playwright, Python, and audits are green.

### Phase 2 — Authentication + Dashboard Shell

- Google OAuth code flow implemented with signed, short-lived return state.
- Google access token is used only to establish verified identity; Google passwords/tokens are not stored by Shalcon.
- Google identities are bound by stable provider subject (`sub`), not by mutable email.
- Email/identity collision handling rejects ambiguous account linking.
- App session tokens are random, stored only by SHA-256 hash, expiring, touchable, and revocable.
- Auth/session middleware protects dashboard API routes.
- Credentialed CORS is restricted to the configured web origin.
- Login surface, loading/error states, dashboard shell, sidebar/topbar, all master routes, responsive mobile drawer, operator identity, and logout are implemented.
- Real D1 auth integration verifies anonymous rejection, valid-session access, identity uniqueness, CORS behavior, logout revocation, migration reproducibility, and foreign-key integrity.
- Playwright verifies dashboard navigation, logout, mobile navigation, and zero console errors.
- Full clean GitHub Actions run is green on commit `41facc71fceb3ab004c55a10ff747ca98bf28fdc`.

## Phase 2 acceptance

- Google OAuth implementation: ✅
- Session/auth middleware: ✅
- Unauthorized API blocked: ✅
- All dashboard routes render: ✅
- Mobile navigation works: ✅
- Logout revokes session: ✅
- No console errors: ✅
- Playwright navigation test: ✅
- Stable Google subject identity binding: ✅
- Production-origin CORS contract: ✅
- Live D1 auth integration: ✅
- Typecheck/lint/unit/build/smoke/audits/Python: ✅

## Phase 3 scope

- First high-quality Salon & Spa template.
- Template registry and versioning.
- Theme DNA schema.
- CSS token system.
- Responsive design.
- Section component contract.
- Safe fallback sections.
- Shalcon concept disclosure.
- Noindex support.
- Long, short, and missing-data QA fixtures.
- Static valid-config preview route.
- Desktop/mobile browser screenshots retained as CI artifacts.

## Phase 3 acceptance

- Visually approved.
- Desktop/mobile complete.
- No broken components.
- Long/short fixture data works.
- Missing fields gracefully hide/fallback.
- Visual snapshots captured.
- Route renders from static valid config.
- Full clean CI passes.

## Blocked

None for Phase 3 implementation. Real Google OAuth client credentials remain required only for provider-level manual OAuth verification and production deployment; secrets must never be committed.

## Known issues

- The D1 database id in `wrangler.jsonc` is a local-development placeholder. Production D1 provisioning belongs to the deployment phase.
- Production Google OAuth client credentials and session secret must be provisioned as Worker secrets.
- Phase 3 abstract visual treatments intentionally avoid stock/remote imagery. Real prospect photography must be evidence-backed or explicitly supplied later.

## Last verified commit

Phase 2: `41facc71fceb3ab004c55a10ff747ca98bf28fdc` — all Phase 0 + Phase 1 + Phase 2 gates green.

## Next action

Push the Phase 3 template/runtime/browser slice, run the complete CI suite, inspect retained desktop/mobile screenshots, and fix every acceptance failure before starting Phase 4.
