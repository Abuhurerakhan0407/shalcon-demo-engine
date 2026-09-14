import { spawn } from 'node:child_process';

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: 'inherit',
      shell: false,
    });
    child.on('error', reject);
    child.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`${command} ${args.join(' ')} failed with ${code}`)));
  });
}

await run('npm', ['run', 'test:phase17']);
await run('node', ['scripts/verify-phase18-d1.mjs']);
await run('node', ['scripts/phase18-audit.mjs']);
await run('node', ['scripts/verify-phase19-d1.mjs']);
await run('node', ['scripts/phase19-audit.mjs']);

console.log('Full Phase 0-19 verification passed.');
