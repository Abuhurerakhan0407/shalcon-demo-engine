# Shalcon Demo-First Outbound Engine

A free-first, evidence-driven sales-production system for Shalcon Intelligence.

The system will find suitable businesses, verify their real details, map them into a prebuilt niche website template, render a private demo, run QA, send controlled outreach, detect replies, and hand qualified conversations to Abu.

## Phase status

**Phase 0 — Repository + Engineering Foundation: COMPLETE / GREEN.**

Next planned phase: **Phase 1 — Data Layer + State Machine**.

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

The repository contains a committed lockfile. Use reproducible installs:

```bash
npm ci
```

## Local runner

```bash
cd apps/local-runner
python3 -m pip install -e '.[dev]'
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

```bash
npm run test:phase0
```

Offline-safe checks are also available:

```bash
npm run test:phase0:offline
```

## Build contract

The canonical long-form product/build contract is `SHALCON_DEMO_FIRST_OUTBOUND_MASTER_HANDOFF.md`, distributed with the project handoff archive. Supply that handoff file together with this repository when moving the build into a fresh ChatGPT coding session.

Never skip phases or acceptance criteria. Never claim an integration is complete when only a mock exists.
