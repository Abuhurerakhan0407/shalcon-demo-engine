# Shalcon Demo-First Outbound Engine

A free-first, evidence-driven sales-production system for Shalcon Intelligence.

The system finds suitable businesses, verifies their real details, maps them into a prebuilt niche website template, renders a private demo, runs QA, sends controlled outreach, detects replies, and hands qualified conversations to Abu.

## Phase status

Current build phase: **Phase 0 — Repository + Engineering Foundation**.

See [`BUILD_STATUS.md`](./BUILD_STATUS.md) for the exact verified state.

## Architecture principle

- **Cloudflare = control plane**: API, auth, canonical database/job state, scheduling, demos, outreach state.
- **Local runner = execution plane**: browser automation, ScrapeGraphAI, Ollama, screenshots, heavy research.
- **Renderer = one codebase, many prospect configs**: never generate or deploy a fresh codebase per prospect.
- **Evidence first**: no verified evidence means no prospect-specific factual claim.

## Workspace

```text
/apps
  /web           React + Vite frontend
  /api           Cloudflare Worker + Hono API
  /local-runner  Python local execution service
/packages
  /shared
  /db
  /agents
  /providers
  /templates
  /template-runtime
  /scoring
  /evidence
  /state-machine
/tests
  /e2e
  /fixtures
  /visual
/docs
```

## Prerequisites

- Node.js 22+
- npm 10+
- Python 3.11+

## Install JavaScript dependencies

```bash
npm install
```

## Local runner

For Phase 0 the runner has no external runtime dependency:

```bash
cd apps/local-runner
PYTHONPATH=src python3 -m shalcon_runner health
python3 -m pytest tests -q
```

## Development

```bash
npm run dev:web
npm run dev:api
```

The web app defaults to `http://localhost:5173` and the Worker to `http://localhost:8787`.

## Verification

Full Phase 0 after dependencies are installed:

```bash
npm run test:phase0
```

Offline-safe checks that do not require downloaded npm packages:

```bash
npm run test:phase0:offline
```

## Build rules

The source of truth is `SHALCON_DEMO_FIRST_OUTBOUND_MASTER_HANDOFF.md` in the project root.
Never skip phases or acceptance criteria. Never claim an integration is complete when only a mock exists.
