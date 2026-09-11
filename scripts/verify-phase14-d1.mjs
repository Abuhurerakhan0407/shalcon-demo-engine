import { spawn } from 'node:child_process';
import { rm } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';

const persistDir = '.wrangler/phase14-d1-test';

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? process.cwd(),
      env: process.env,
      stdio: 'inherit',
      shell: false,
    });
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`${command} ${args.join(' ')} failed with ${code}`)),
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
      throw new Error(`Integration worker returned HTTP ${response.status}: ${await response.text()}`);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Integration worker returned HTTP')) throw error;
      lastError = error;
    }
    await sleep(400);
  }
  throw lastError instanceof Error ? lastError : new Error('Timed out waiting for Phase 14 worker.');
}

async function terminate(child) {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === 'win32') {
    const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
      stdio: 'ignore',
      shell: false,
    });
    await new Promise((resolve) => killer.once('exit', resolve));
    return;
  }
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    child.kill('SIGTERM');
  }
  await sleep(800);
  if (child.exitCode === null && child.signalCode === null) {
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch {
      child.kill('SIGKILL');
    }
  }
}

await rm(persistDir, { recursive: true, force: true });
const wrangler = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const apiCwd = 'apps/api';
const migrationArgs = [
  'wrangler',
  'd1',
  'migrations',
  'apply',
  'DB',
  '--local',
  '--persist-to',
  '../../.wrangler/phase14-d1-test',
];
await run(wrangler, migrationArgs, { cwd: apiCwd });
await run(wrangler, migrationArgs, { cwd: apiCwd });

const worker = spawn(
  wrangler,
  [
    'wrangler',
    'dev',
    'src/phase14.integration.ts',
    '--local',
    '--port',
    '8801',
    '--persist-to',
    '../../.wrangler/phase14-d1-test',
  ],
  {
    cwd: apiCwd,
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
  const response = await waitFor('http://127.0.0.1:8801/phase14');
  const result = await response.json();
  const checks = result.checks ?? {};
  const required = [
    result.ok === true,
    checks.migrationApplied === true,
    checks.allowedRegistryOnly === true,
    checks.explicitBrandSignalsPreserved === true,
    checks.unknownBrandUsesSafeDefault === true,
    checks.insufficientContentUsesCompatibleLayout === true,
    checks.fitScoreDeterministic === true,
    checks.stateTransitionsEnforced === true,
    checks.manualOverrideLogged === true,
    checks.invalidRegistryBlocked === true,
    checks.selectionVersioned === true,
    checks.archetypePersisted === true,
    checks.foreignKeyViolations === 0,
  ];
  if (required.some((value) => !value)) {
    throw new Error(`Phase 14 D1 assertion failed: ${JSON.stringify(result, null, 2)}`);
  }
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(logs);
  throw error;
} finally {
  await terminate(worker);
}
