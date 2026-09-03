import { access, readFile } from 'node:fs/promises';

const required = [
  'apps/local-runner/src/shalcon_runner/url_safety.py',
  'apps/local-runner/src/shalcon_runner/egress_proxy.py',
  'apps/local-runner/src/shalcon_runner/research.py',
  'apps/local-runner/tests/test_url_safety.py',
  'apps/local-runner/tests/test_egress_proxy.py',
  'apps/local-runner/tests/test_research.py',
  'apps/api/src/research-result.ts',
  'apps/api/src/research-persistence.ts',
  'apps/api/src/research-runner-routes.ts',
  'apps/api/src/phase9.integration.ts',
  'scripts/verify-phase9-d1.mjs',
];
for (const path of required) await access(path);

const safety = await readFile('apps/local-runner/src/shalcon_runner/url_safety.py', 'utf8');
for (const contract of ['validate_public_http_url','address.is_global','localhost','embedded credentials','getaddrinfo','_ALLOWED_WEB_PORTS']) {
  if (!safety.includes(contract)) throw new Error(`Missing Phase 9 URL-safety contract: ${contract}`);
}

const egress = await readFile('apps/local-runner/src/shalcon_runner/egress_proxy.py', 'utf8');
for (const contract of ['PublicSocksProxy','resolve_public_target','ipaddress.ip_address(ip).is_global','_ALLOWED_WEB_PORTS','socket.getaddrinfo','remote.connect(target)','DNS is resolved once here']) {
  if (!egress.includes(contract)) throw new Error(`Missing Phase 9 egress contract: ${contract}`);
}

const research = await readFile('apps/local-runner/src/shalcon_runner/research.py', 'utf8');
for (const contract of ['sync_playwright','context.route','page.goto','inner_text','page.content','page.screenshot','requestfailed','discoveredLinks','sourceOnly','_SAFE_NON_NETWORK_SCHEMES','route.abort("blockedbyclient")','final_url = self.validator(candidate)','service_workers="block"','route_web_socket','web_socket.close','PublicSocksProxy','"bypass": "<-loopback>"']) {
  if (!research.includes(contract)) throw new Error(`Missing Phase 9 browser contract: ${contract}`);
}

const worker = await readFile('apps/local-runner/src/shalcon_runner/worker.py', 'utf8');
for (const contract of ['PLAYWRIGHT_RESEARCH','complete_research','_LeaseKeeper','client.renew','lease_seconds','ensure_current']) {
  if (!worker.includes(contract)) throw new Error(`Missing long-running runner lease contract: ${contract}`);
}

const persistence = await readFile('apps/api/src/research-persistence.ts', 'utf8');
for (const contract of ['SourceRecordRepository', 'getByIdForUser', 'parseResearchResultForJob', 'WEBSITE_PAGE', 'expectedRequestedUrl']) {
  if (!persistence.includes(contract)) throw new Error(`Missing research persistence contract: ${contract}`);
}
if (persistence.includes('EvidenceRepository') || persistence.includes('ProspectFactRepository')) throw new Error('Phase 9 research persistence must not promote source material to evidence/facts.');

const runnerRoutes = await readFile('apps/api/src/research-runner-routes.ts', 'utf8');
for (const contract of ['JobContextRepository','payloadResearchUrl','context.userId !== runner.userId','completeSchema.safeParse','expectedRequestedUrl']) {
  if (!runnerRoutes.includes(contract)) throw new Error(`Missing research completion ownership/input contract: ${contract}`);
}

const sourceRepository = await readFile('packages/db/src/repositories/evidence.ts', 'utf8');
for (const contract of ['createOrGet', 'sourceIdentityMatches', 'immutable identity mismatch', 'Browser retries']) {
  if (!sourceRepository.includes(contract)) throw new Error(`Missing retry-safe immutable source-record contract: ${contract}`);
}

const resultSchema = await readFile('apps/api/src/research-result.ts', 'utf8');
for (const contract of ['playwright-research.v1','sourceOnly','pageCount','navigationError','requestFailures','httpErrors','.min(1).max(6)','unique finalUrl values','canonicalResearchUrl','requested URL does not match the claimed job payload','First research page must represent the requested URL']) {
  if (!resultSchema.includes(contract)) throw new Error(`Missing research-result validation contract: ${contract}`);
}

const integration = await readFile('apps/api/src/phase9.integration.ts', 'utf8');
for (const contract of ['sourceUrlsStored','diagnosticsPersisted','sourceMaterialOnly','retrySourceReplaySafe','retrySourceIdentityCollisionRejected','mismatchedProspectRejected','requestedUrlMismatchRejected','malformedCompletionRejected','rejectedResultsPersistNothing','noUnsupportedFactsGenerated']) {
  if (!integration.includes(contract)) throw new Error(`Missing Phase 9 D1 acceptance: ${contract}`);
}

const ci = await readFile('.github/workflows/ci.yml', 'utf8');
if (!ci.includes('python -m playwright install --with-deps --only-shell chromium')) throw new Error('Python CI does not install the Phase 9 Chromium runtime.');

const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
if (!packageJson.scripts?.['test:phase9:d1'] || !packageJson.scripts?.['test:phase9:audit'] || !packageJson.scripts?.['test:phase9']) throw new Error('Permanent Phase 9 scripts are missing.');

console.log('Phase 9 audit passed.');
