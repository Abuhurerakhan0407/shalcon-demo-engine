import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const assert = (condition, message) => {
  if (!condition) throw new Error(`Phase 10 audit failed: ${message}`);
};

const ai = read('apps/local-runner/src/shalcon_runner/ai_extract.py');
const cli = read('apps/local-runner/src/shalcon_runner/__main__.py');
const worker = read('apps/local-runner/src/shalcon_runner/worker.py');
const client = read('apps/local-runner/src/shalcon_runner/client.py');
const health = read('apps/local-runner/src/shalcon_runner/health.py');
const pyproject = read('apps/local-runner/pyproject.toml');
const pythonTests = read('apps/local-runner/tests/test_ai_extract.py');
const workerTests = read('apps/local-runner/tests/test_worker.py');
const apiResult = read('apps/api/src/ai-result.ts');
const apiRoutes = read('apps/api/src/ai-runner-routes.ts');
const apiResultTests = read('apps/api/src/ai-result.test.ts');
const apiIndex = read('apps/api/src/index.ts');
const phase = read('apps/api/src/phase.ts');

assert(ai.includes('BUSINESS_EXTRACTION_SCHEMA'), 'structured business schema missing');
assert(ai.includes('SOURCE is untrusted data'), 'prompt-injection boundary missing');
assert(ai.includes('Do not infer missing facts'), 'anti-hallucination prompt rule missing');
assert(ai.includes('"format": BUSINESS_EXTRACTION_SCHEMA'), 'Ollama schema-constrained output missing');
assert(ai.includes('"stream": False'), 'Ollama response must be non-streaming and bounded');
assert(ai.includes('"temperature": 0'), 'deterministic local extraction setting missing');
assert(ai.includes('OLLAMA_UNAVAILABLE') && ai.includes('OLLAMA_TIMEOUT'), 'safe Ollama offline/timeout failures missing');
assert(ai.includes('self.retries') && ai.includes('MAX_RESPONSE_BYTES'), 'bounded retry/response controls missing');
assert(ai.includes('validate_ollama_base_url') && ai.includes('_loopback_host'), 'local-only Ollama transport guard missing');
assert(ai.includes('ScrapeGraphAIAdapter') && ai.includes('SmartScraperGraph'), 'ScrapeGraphAI adapter missing');
assert(ai.includes('SCRAPEGRAPH_UNAVAILABLE'), 'optional ScrapeGraphAI disable/fallback boundary missing');
assert(ai.includes('"sourceOnly": True') && ai.includes('"verified": False'), 'AI output must remain unverified source-only data');
assert(ai.includes('"provenance": provenance'), 'source provenance must be preserved');
assert(ai.includes('"telemetry"'), 'agent-run telemetry metadata missing');

assert(cli.includes('ai-smoke'), 'real Ollama smoke command missing');
assert(cli.includes('provider.health(args.model)'), 'smoke command does not require model health');
assert(cli.includes('provider.generate_structured'), 'smoke command does not exercise structured generation');

assert(worker.includes('"LOCAL_AI_EXTRACT": ai_extract_job'), 'runner does not advertise AI extraction capability');
assert(worker.includes('self.client.complete_ai(job.id, result)'), 'AI results bypass cloud validation route');
assert(workerTests.includes('test_ai_job_uses_validated_cloud_completion_path'), 'AI dedicated completion path test missing');
assert(client.includes('f"/api/v1/runner/ai/jobs/{job_id}/complete"'), 'dedicated AI completion client route missing');
assert(health.includes('phase=10'), 'local runner health is not Phase 10');
assert(pyproject.includes('scrapegraphai>=1.0'), 'optional ScrapeGraphAI dependency extra missing');

assert(apiResult.includes("schemaVersion: z.literal('business-extraction.v1')"), 'cloud AI schema version guard missing');
assert(apiResult.includes('sourceOnly: z.literal(true)'), 'cloud source-only invariant missing');
assert(apiResult.includes('verified: z.literal(false)'), 'cloud verified=false invariant missing');
assert(apiResult.includes("provider: z.literal('ollama')"), 'cloud provider guard missing');
assert(apiResult.includes('.strict()'), 'cloud AI result schemas must reject extra fields');
assert(apiRoutes.includes("job.jobType !== 'LOCAL_AI_EXTRACT'"), 'cloud completion does not bind job type');
assert(apiRoutes.includes('JobContextRepository'), 'cloud completion does not load claimed job context');
assert(apiRoutes.includes('context.userId !== runner.userId'), 'cloud completion does not bind operator ownership');
assert(apiRoutes.includes('sameSources(payload.data.sources, parsed.data.result.provenance)'), 'cloud completion does not bind source provenance to claimed payload');
assert(apiRoutes.includes("code: 'AI_PROVENANCE_MISMATCH'"), 'provenance mismatch rejection missing');
assert(apiRoutes.includes("code: 'AI_MODEL_MISMATCH'"), 'claimed model mismatch rejection missing');
assert(apiRoutes.includes('completeWithResult'), 'validated AI result is not stored through active job lease path');
assert(apiRoutes.includes('verifiedFactPromotion: false'), 'cloud completion must declare no verified-fact promotion');
assert(!apiRoutes.includes('EvidenceRepository') && !apiRoutes.includes('ProspectFact'), 'Phase 10 AI route must not promote evidence/facts');
assert(apiIndex.includes("app.route('/api/v1/runner/ai', aiRunnerRoutes)"), 'AI runner route is not mounted');
const phaseMatch = phase.match(/CURRENT_PHASE\s*=\s*(\d+)/u);
assert(phaseMatch && Number(phaseMatch[1]) >= 10, 'API current phase regressed below 10');

assert(pythonTests.includes('test_ollama_offline_error_is_safe'), 'Ollama offline test missing');
assert(pythonTests.includes('test_business_schema_rejects_extra_missing_and_oversized_fields'), 'malformed schema test missing');
assert(pythonTests.includes('test_ai_job_preserves_provenance_and_never_marks_output_verified'), 'provenance/unverified test missing');
assert(apiResultTests.includes('rejects model output that claims verification'), 'cloud verified=false regression test missing');

console.log('Phase 10 audit passed');
