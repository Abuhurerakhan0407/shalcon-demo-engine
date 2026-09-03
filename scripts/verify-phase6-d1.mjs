import { spawn } from 'node:child_process';
import { rm } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';

const persistDir = '.wrangler/phase6-d1-test';

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
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
      if (error instanceof Error && error.message.startsWith('Integration worker returned HTTP')) {
        throw error;
      }
      lastError = error;
    }
    await sleep(400);
  }
  throw lastError instanceof Error ? lastError : new Error('Timed out waiting for Phase 6 worker.');
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
const migrationArgs = ['--workspace', '@shalcon/api', 'run', 'db:migrate:phase6:local'];
await run('npm', migrationArgs);
await run('npm', migrationArgs);

const worker = spawn('npm', ['--workspace', '@shalcon/api', 'run', 'test:d1:phase6-worker'], {
  cwd: process.cwd(),
  env: process.env,
  stdio: ['ignore', 'pipe', 'pipe'],
  shell: false,
  detached: process.platform !== 'win32',
});
let logs = '';
worker.stdout?.on('data', (chunk) => (logs += String(chunk)));
worker.stderr?.on('data', (chunk) => (logs += String(chunk)));

try {
  const response = await waitFor('http://127.0.0.1:8794/phase6');
  const result = await response.json();
  const checks = result.checks ?? {};
  const required = [
    result.ok === true,
    result.migrationCount >= 5,
    checks.firstDemoRendered === true,
    checks.secondDemoRendered === true,
    checks.configOnlyVariation === true,
    checks.sameRendererVersion === true,
    checks.robotsProtected === true,
    checks.disclosurePresent === true,
    checks.disabledFailsClosed === true,
    checks.expiredFailsClosed === true,
    checks.invalidConfigFailsClosed === true,
    checks.unknownTokenFailsClosed === true,
    checks.noPublicListing === true,
    checks.rawTokenNeverStored === true,
    checks.exactTemplateSeeded === true,
    checks.foreignKeyViolations === 0,
  ];
  if (required.some((value) => !value)) {
    throw new Error(`Phase 6 D1 assertion failed: ${JSON.stringify(result, null, 2)}`);
  }
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(logs);
  throw error;
} finally {
  await terminate(worker);
}
