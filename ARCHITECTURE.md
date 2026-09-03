# Architecture — Phase 0 Baseline

## Product boundary

The Shalcon Demo-First Outbound Engine sells website projects by showing a tailored private concept before asking for a meeting.

It does **not** create one codebase per lead. One universal renderer consumes verified prospect configuration and a versioned niche template.

## Runtime split

```text
Web dashboard (React/Vite)
        |
        v
Cloudflare Worker API (Hono)
        |
        +--> D1 / canonical state [Phase 1+]
        +--> Queues / scheduler     [Phase 8+]
        |
        v
Local runner (Python)
        |
        +--> Playwright             [Phase 9+]
        +--> ScrapeGraphAI          [Phase 10+]
        +--> Ollama                 [Phase 10+]
```

### Control plane

Cloudflare owns lightweight, canonical coordination:

- auth
- API
- canonical prospect state
- canonical job ledger
- demo configs
- outreach state
- event-derived analytics

### Execution plane

The local runner owns heavy work:

- browser automation
- scraping
- local model inference
- screenshots
- research jobs

The local runner must be optional/offline without corrupting cloud state.

## Package boundaries

- `@shalcon/shared`: cross-runtime contracts and constants.
- `@shalcon/db`: database abstractions/migrations beginning Phase 1.
- `@shalcon/agents`: structured AI module contracts beginning later phases.
- `@shalcon/providers`: replaceable provider interfaces/adapters.
- `@shalcon/templates`: immutable, versioned template registry and DNA contracts.
- `@shalcon/template-runtime`: renderer-facing config helpers.
- `@shalcon/scoring`: deterministic scoring logic.
- `@shalcon/evidence`: evidence/verification contracts.
- `@shalcon/state-machine`: explicit prospect state definitions and later transition logic.

## Phase 0 architectural invariants

1. Strict TypeScript.
2. External integrations behind adapters.
3. No secrets in source control.
4. No provider calls from React components.
5. No business logic in React components.
6. No arbitrary AI-generated website code per prospect.
7. One codebase, versioned templates, structured prospect config.
8. Python runner separate from Worker runtime.
9. Tests and build status are first-class artifacts.
10. Phase gates are enforced honestly.
