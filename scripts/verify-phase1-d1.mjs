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
      const body = await response.text();
      throw new Error(`Integration worker returned HTTP ${response.status}: ${body}`);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Integration worker returned HTTP')) {
        throw error;
      }
      lastError = error;
    }
    await sleep(500);
  }
  throw lastError instanceof Error ? lastError : new Error('Timed out waiting for D1 integration worker.');
}

async function terminateProcessTree(child) {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;

  const exited = new Promise((resolve) => child.once('exit', () => resolve(true)));

  if (process.platform === 'win32') {
    const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
      stdio: 'ignore',
      shell: false,
    });
    await new Promise((resolve) => killer.once('exit', resolve));
  } else {
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {
      child.kill('SIGTERM');
    }
  }

  const graceful = await Promise.race([exited, sleep(3_000).then(() => false)]);
  if (!graceful && child.exitCode === null && child.signalCode === null) {
    if (process.platform === 'win32') {
      const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
        stdio: 'ignore',
        shell: false,
      });
      await new Promise((resolve) => killer.once('exit', resolve));
    } else {
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch {
        child.kill('SIGKILL');
      }
    }
    await Promise.race([
      new Promise((resolve) => child.once('exit', () => resolve(true))),
      sleep(1_000),
    ]);
  }

  child.stdout?.destroy();
  child.stderr?.destroy();
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
  detached: process.platform !== 'win32',
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
  await terminateProcessTree(worker);
}
