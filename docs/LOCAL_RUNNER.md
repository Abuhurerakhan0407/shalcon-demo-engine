# Local Runner

Phase 0 provides only the runner process skeleton and health contract.

The runner becomes the heavy execution plane in later phases. It will eventually host Playwright, ScrapeGraphAI, and Ollama, while the Cloudflare Worker remains the control plane.

## Health

```bash
cd apps/local-runner
PYTHONPATH=src python3 -m shalcon_runner health
```

Expected shape:

```json
{"mode":"foundation","ok":true,"phase":0,"python":"...","service":"shalcon-local-runner","version":"0.1.0"}
```

No queue polling, scraping, or model calls belong in Phase 0.
