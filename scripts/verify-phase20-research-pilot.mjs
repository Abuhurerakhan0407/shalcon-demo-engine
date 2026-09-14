import { spawn } from 'node:child_process';
import { readFile, rm } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';

const persistDir = '.wrangler/phase20-research-pilot';
const port = 8807;
const baseUrl = `http://127.0.0.1:${port}`;
const runnerToken = 'rnr_phase20_research_pilot_token_1234567890';
const requestedJobs = Number.parseInt(process.env.PHASE20_PILOT_JOBS ?? '3', 10);
if (!Number.isInteger(requestedJobs) || requestedJobs < 0 || requestedJobs > 3) {
  throw new Error('PHASE20_PILOT_JOBS must be an integer from 0 to 3.');
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? process.cwd(),
      env: options.env ?? process.env,
      stdio: 'inherit',
      shell: false,
    });
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`${command} failed with ${code}`)),
    );
  });
}

async function waitFor(url, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await globalThis.fetch(url);
      if (response.ok) return response;
      throw new Error(`Phase 20 pilot worker returned HTTP ${response.status}: ${await response.text()}`);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Phase 20 pilot worker returned HTTP')) throw error;
      lastError = error;
    }
    await sleep(400);
  }
  throw lastError instanceof Error ? lastError : new Error('Timed out waiting for Phase 20 pilot worker.');
}

async function terminate(child) {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === 'win32') {
    const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore', shell: false });
    await new Promise((resolve) => killer.once('exit', resolve));
    return;
  }
  try { process.kill(-child.pid, 'SIGTERM'); } catch { child.kill('SIGTERM'); }
  await sleep(800);
  if (child.exitCode === null && child.signalCode === null) {
    try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); }
  }
}

const trial = JSON.parse(await readFile('docs/phase20-salon-accuracy-trial.json', 'utf8'));
const candidates = trial.prospects
  .filter((prospect) => prospect.sourceClass === 'OFFICIAL_WEBSITE')
  .slice(0, 3)
  .map((prospect) => ({
    id: prospect.id,
    businessName: prospect.businessName,
    location: prospect.location,
    sourceUrl: prospect.sourceUrl,
    officialWebsite: prospect.officialWebsite,
  }));
if (candidates.length !== 3) throw new Error('Phase 20 pilot requires three official-site cohort prospects.');
if (candidates.some((candidate) => candidate.result !== undefined)) {
  throw new Error('Phase 20 pilot candidate projection unexpectedly contains trial results.');
}

await rm(persistDir, { recursive: true, force: true });
const migrationArgs = [
  'wrangler', 'd1', 'migrations', 'apply', 'DB', '--local',
  '--persist-to', '../../.wrangler/phase20-research-pilot',
];
await run('npx', migrationArgs, { cwd: 'apps/api' });
await run('npx', migrationArgs, { cwd: 'apps/api' });

const worker = spawn(
  'npx',
  [
    'wrangler', 'dev', 'src/phase20-research-pilot.integration.ts', '--local',
    '--port', String(port), '--persist-to', '../../.wrangler/phase20-research-pilot',
  ],
  {
    cwd: 'apps/api',
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
    detached: process.platform !== 'win32',
  },
);
let logs = '';
worker.stdout?.on('data', (chunk) => (logs += String(chunk)));
worker.stderr?.on('data', (chunk) => (logs += String(chunk)));

try {
  await waitFor(`${baseUrl}/phase20/health`);
  const setupResponse = await globalThis.fetch(`${baseUrl}/phase20/setup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ candidates }),
  });
  if (!setupResponse.ok) {
    throw new Error(`Phase 20 pilot setup failed with ${setupResponse.status}: ${await setupResponse.text()}`);
  }
  const setup = await setupResponse.json();
  if (setup.created?.length !== 3 || setup.trialResultsModified !== false) {
    throw new Error(`Phase 20 pilot setup assertion failed: ${JSON.stringify(setup)}`);
  }
  if (setup.created.some((item) => item.state !== 'IDENTITY_VERIFIED')) {
    throw new Error(`Phase 20 pilot identity gate failed: ${JSON.stringify(setup.created)}`);
  }

  if (requestedJobs > 0) {
    await run(
      'python',
      ['scripts/phase20-research-pilot.py', '--api-url', baseUrl, '--jobs', String(requestedJobs)],
      {
        env: {
          ...process.env,
          PYTHONPATH: 'apps/local-runner/src',
          SHALCON_RUNNER_TOKEN: runnerToken,
        },
      },
    );
  }

  const statusResponse = await waitFor(`${baseUrl}/phase20/status`);
  const status = await statusResponse.json();
  const completedResearch = status.researchJobs?.filter((job) => job.status === 'COMPLETED') ?? [];
  const pendingResearch = status.researchJobs?.filter((job) => job.status === 'PENDING') ?? [];
  const failedResearch = status.researchJobs?.filter((job) => job.status === 'FAILED') ?? [];
  const completedEntities = new Set(completedResearch.map((job) => job.entity_id));
  const completedProspects = status.prospects?.filter((prospect) => completedEntities.has(prospect.id)) ?? [];
  const sourceCoverage = completedProspects.every(
    (prospect) => prospect.playwrightSourceCount >= 1 && prospect.sourceCount >= 1,
  );
  const phase11Coverage = completedProspects.every(
    (prospect) => status.aiJobs?.some((job) => job.entity_id === prospect.id && job.status === 'PENDING'),
  );

  const required = [
    status.trialResultsModified === false,
    status.foreignKeyViolations === 0,
    status.prospects?.length === 3,
    status.researchJobs?.length === 3,
    completedResearch.length === requestedJobs,
    pendingResearch.length === 3 - requestedJobs,
    failedResearch.length === 0,
    sourceCoverage,
    requestedJobs === 0 ? (status.aiJobs?.length ?? 0) === 0 : (status.aiJobs?.length ?? 0) >= requestedJobs,
    phase11Coverage,
  ];
  if (required.some((value) => !value)) {
    throw new Error(`Phase 20 live research pilot assertion failed: ${JSON.stringify({ requestedJobs, status }, null, 2)}`);
  }

  const after = JSON.parse(await readFile('docs/phase20-salon-accuracy-trial.json', 'utf8'));
  if (after.prospects.some((prospect) => prospect.result !== null)) {
    throw new Error('Phase 20 live research pilot modified the market-trial result ledger.');
  }

  console.log(JSON.stringify({
    ok: true,
    requestedJobs,
    prospectCount: status.prospects.length,
    completedResearchJobs: completedResearch.length,
    pendingResearchJobs: pendingResearch.length,
    phase11JobsQueued: status.aiJobs.length,
    sourceCoverage,
    trialResultsModified: false,
  }, null, 2));
} catch (error) {
  console.error(logs);
  throw error;
} finally {
  await terminate(worker);
}
