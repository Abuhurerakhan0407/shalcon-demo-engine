# Build Status

Current phase: **Phase 1 — Data Layer + State Machine**  
Status: **IN PROGRESS — implementation complete locally; awaiting full GitHub CI verification**

## Completed

- Phase 0 repository and engineering foundation remains green.
- D1 initial migration created from the master database design.
- D1 binding and migration directory configured for local Worker development.
- Typed D1 repository contract created without tying domain packages to runtime globals.
- User, campaign, prospect, job, and agent-run repositories implemented.
- Prospect state machine implemented with explicit allowed transitions.
- Illegal prospect state transitions throw a dedicated error.
- Prospect state changes are audit-recorded by a D1 trigger.
- Canonical job states, leasing, retries, dead-letter behavior, and ownership checks implemented.
- Unique job idempotency key constraint implemented.
- Deterministic idempotency-key utility implemented.
- Phase 1 fixtures and unit tests implemented.
- Real local-D1 integration harness implemented through Wrangler.
- Migration reproducibility check applies the migration twice against the same local D1 state.
- Phase 1 structural/state/idempotency audit added.

## In progress

- GitHub Actions verification on a clean checkout.
- Root-cause fixes for any failures exposed by real D1/Wrangler CI.

## Blocked

None currently.

## Tests

- Typecheck: pending CI
- Lint: pending CI
- Unit: pending CI
- D1 migration fresh apply: pending CI
- D1 migration reproducibility: pending CI
- D1 repository integration: pending CI
- State transitions: implemented; pending CI
- Illegal transition rejection: implemented; pending CI
- Idempotency: implemented; pending CI
- Playwright: Phase 0 foundation test retained; pending CI
- Pytest: Phase 0 runner tests retained; pending CI

## Known issues

- The D1 database id in `wrangler.jsonc` is a local-development placeholder. Production D1 provisioning belongs to the deployment phase; no fake production resource is claimed.
- Phase 1 intentionally does not add auth, discovery, scraping, AI, outreach, or production data.

## Risks

- Wrangler/D1 local persistence semantics must be validated by CI rather than inferred.
- Future phases may require additive migrations; the initial migration must not be edited after production deployment.

## Last verified commit

Phase 0 code: `53c3123cb6ec06d57fa6e9db3e9f16267f0159ae` (all Phase 0 gates green).

## Next action

Push Phase 1 implementation, run CI, fix every failure, and mark Phase 1 complete only when all acceptance criteria are green.
