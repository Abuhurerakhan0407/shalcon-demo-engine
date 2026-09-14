# Phase 20 Local Operator Workspace

This workspace exists only for the real 20-prospect Salon Accuracy Trial. It keeps D1 state across restarts without deploying a production database or weakening the evidence policy.

## Safety boundaries

- Use `apps/api/src/phase20-operator.integration.ts`, never the production Worker entrypoint.
- The operator shell rejects production mode and non-local hostnames.
- Keep the locked cohort in `docs/phase20-salon-accuracy-trial.json` unchanged until real demo QA is complete.
- AI evidence stays `PROBABLE` / `UNVERIFIED` until a human verifies or rejects it in Evidence Review.
- Do not lower demo-worthiness thresholds or auto-promote AI evidence.

## 1. Install and migrate the durable local D1

```bash
npm ci
rm -rf .wrangler/phase20-operator
cd apps/api
npx wrangler d1 migrations apply DB --local --persist-to ../../.wrangler/phase20-operator
```

Only remove `.wrangler/phase20-operator` when intentionally starting the trial from a clean database. Normal restarts should reuse it.

## 2. Start the local operator API

From `apps/api`:

```bash
npx wrangler dev src/phase20-operator.integration.ts \
  --local \
  --port 8787 \
  --persist-to ../../.wrangler/phase20-operator
```

The health endpoint is `http://127.0.0.1:8787/phase20/operator-health`.

## 3. Seed the locked 20-prospect cohort

Choose one local runner token with at least 24 characters and keep the same token for the worker:

```bash
export SHALCON_RUNNER_TOKEN='replace-with-a-long-local-token'
node scripts/phase20-operator-seed.mjs
```

The seeder refuses a non-empty operator D1 and refuses a trial file whose result fields have already been changed. It seeds the 20 candidates in bounded batches while preserving `trialResultsModified: false`.

## 4. Run Ollama and the local runner

Use the already-proven Phase 20 model path (`qwen3:0.6b`) and keep the runner pointed at the local operator API:

```bash
export SHALCON_API_BASE_URL=http://127.0.0.1:8787
export SHALCON_RUNNER_TOKEN='replace-with-the-same-long-local-token'
export OLLAMA_BASE_URL=http://127.0.0.1:11434
export OLLAMA_MODEL=qwen3:0.6b
npm run dev:runner
```

The runner must remain online until the queued Playwright and local-AI jobs finish.

## 5. Start the operator UI

In another terminal from the repository root:

```bash
VITE_API_BASE_URL=http://127.0.0.1:8787 npm --workspace @shalcon/web run dev -- --host 127.0.0.1
```

Open the local web app and use **Evidence Review**. Review the exact source URL, excerpt, confidence, and source quality before choosing Verify, Verify + use as fact, or Reject.

## 6. Export a review packet

After research has populated evidence, export a portable snapshot of the unresolved review queue:

```bash
node scripts/phase20-export-review-packet.mjs --out=phase20-review-packet.json
```

The exporter only accepts the local operator workspace. It refuses a dirty trial state and includes each prospect's unresolved evidence, conflicts, canonical facts, and immutable review history without changing any review decision or trial result.

## 7. Trial discipline

After human evidence review, run the normal audit/scoring/demo/QA path for each prospect. Record a result in `docs/phase20-salon-accuracy-trial.json` only after the actual prospect demo has been inspected. Every completed result must explicitly record all nine correction categories. Phase 20 closes only at 18/20 zero-factual-correction demos with zero critical factual errors.
