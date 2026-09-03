import { spawn } from 'node:child_process';
import { rm } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';

const persistDir = '.wrangler/phase1-d1-test';

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
      shell: false,
    });
    let stdout = '';
    let stderr = '';
    if (options.capture) {
      child.stdout?.on('data', (chunk) => (stdout += String(chunk)));
      child.stderr?.on('data', (chunk) => (stderr += String(chunk)));
    }
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${command} ${args.join(' ')} failed with ${code}\n${stdout}\n${stderr}`));
    });
  });
}

async function waitForIntegration(url, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await globalThis.fetch(url);
      if (response.ok) return response;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await sleep(500);
  }
  throw lastError instanceof Error ? lastError : new Error('Timed out waiting for D1 integration worker.');
}

await rm(persistDir, { recursive: true, force: true });

const migrationArgs = ['--workspace', '@shalcon/api', 'run', 'db:migrate:local'];
await run('npm', migrationArgs);
await run('npm', migrationArgs);

const worker = spawn('npm', ['--workspace', '@shalcon/api', 'run', 'test:d1:worker'], {
  cwd: process.cwd(),
  env: process.env,
  stdio: ['ignore', 'pipe', 'pipe'],
  shell: false,
});

let logs = '';
worker.stdout?.on('data', (chunk) => (logs += String(chunk)));
worker.stderr?.on('data', (chunk) => (logs += String(chunk)));

try {
  const response = await waitForIntegration('http://127.0.0.1:8790/phase1');
  const result = await response.json();
  const checks = result.repositoryChecks ?? {};
  const required = [
    result.ok === true,
    result.migrationCount >= 1,
    checks.user === true,
    checks.campaign === true,
    checks.prospectState === 'NORMALIZED',
    checks.stateEventCount === 1,
    checks.illegalTransitionRejected === true,
    checks.idempotentCreate === true,
    checks.jobCompleted === true,
    checks.agentRunCompleted === true,
    checks.foreignKeyViolations === 0,
  ];
  if (required.some((value) => !value)) {
    throw new Error(`Phase 1 D1 integration assertion failed: ${JSON.stringify(result, null, 2)}`);
  }
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(logs);
  throw error;
} finally {
  worker.kill('SIGTERM');
  await sleep(500);
  if (!worker.killed) worker.kill('SIGKILL');
}
