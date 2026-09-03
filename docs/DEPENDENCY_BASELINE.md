# Dependency Baseline — 2026-09-03

Phase 0 package ranges were checked against current upstream package releases before the first repository commit.

Key runtime/tooling choices:

- React 19.2.x
- Vite 8.2.x
- Hono 4.13.x
- Wrangler 4.127.x
- Playwright 1.62.x
- Vitest 4.1.x
- Tailwind CSS 4.3.x
- React Router 7.18.x
- TanStack Query 5.102.x
- Zod 4.5.x
- ESLint 10.9.x
- Prettier 3.9.x
- typescript-eslint 8.68.x

## TypeScript compatibility decision

The newest TypeScript package line is newer than the support window of the current `typescript-eslint` release. The project therefore intentionally uses:

```text
TypeScript >=5.8.3 <6.1.0
```

This keeps lint/type-aware tooling within the officially supported typescript-eslint range. Upgrade TypeScript only after the linter ecosystem explicitly supports the newer major.

## Cloudflare types

Do not depend on `@cloudflare/workers-types` as the long-term typing strategy. Current Cloudflare guidance recommends generating bindings with `wrangler types`; the API package includes a `cf:types` script for that later workflow.

## Lockfile

`package-lock.json` must be generated and committed by the first environment with npm-registry access. Until then, CI must use `npm install`, not `npm ci`.
