import { spawn } from 'node:child_process';
import { rm } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';

const persistDir = '.wrangler/phase17-d1-test';
function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: process.cwd(), env: process.env, stdio: 'inherit', shell: false });
    child.on('error', reject);
    child.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`${command} ${args.join(' ')} failed with ${code}`)));
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
  throw lastError instanceof Error ? lastError : new Error('Timed out waiting for Phase 17 config worker.');
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

await rm(persistDir, { recursive: true, force: true });
await run('npm', ['--workspace', '@shalcon/api', 'run', 'db:migrate:phase17:local']);
const worker = spawn(
  'npm',
  ['--workspace', '@shalcon/api', 'exec', '--', 'wrangler', 'dev', 'src/phase17-config-smoke.integration.ts', '--local', '--port', '8808', '--persist-to', '../../.wrangler/phase17-d1-test'],
  { cwd: process.cwd(), env: process.env, stdio: ['ignore', 'pipe', 'pipe'], shell: false, detached: process.platform !== 'win32' },
);
let logs = '';
worker.stdout?.on('data', (chunk) => (logs += String(chunk)));
worker.stderr?.on('data', (chunk) => (logs += String(chunk)));
try {
  const response = await waitFor('http://127.0.0.1:8808/phase17-config-smoke');
  const result = await response.json();
  const checks = result.checks ?? {};
  if (!(result.ok === true && checks.contentApplied === true && checks.themeApplied === true && checks.assetInputValid === true && checks.operatorRenderValid === true && checks.noindex === true)) {
    throw new Error(`Phase 17 config smoke assertion failed: ${JSON.stringify(result, null, 2)}`);
  }
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(logs);
  throw error;
} finally {
  await terminate(worker);
}
