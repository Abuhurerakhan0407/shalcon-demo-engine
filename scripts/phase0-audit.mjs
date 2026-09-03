import { readFile, readdir } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const failures = [];

const required = [
  'package.json',
  'tsconfig.base.json',
  '.env.example',
  '.gitignore',
  'README.md',
  'BUILD_STATUS.md',
  'ARCHITECTURE.md',
  'apps/web/package.json',
  'apps/web/src/main.tsx',
  'apps/api/package.json',
  'apps/api/src/index.ts',
  'apps/local-runner/pyproject.toml',
  'apps/local-runner/src/shalcon_runner/__main__.py',
  'packages/shared/src/index.ts',
  'packages/templates/src/index.ts',
  'packages/state-machine/src/index.ts',
  'vitest.config.ts',
  'playwright.config.ts',
  'tests/e2e/foundation.spec.ts',
  '.github/workflows/ci.yml',
];

async function exists(file) {
  try {
    await readFile(join(root, file));
    return true;
  } catch {
    return false;
  }
}

for (const file of required) {
  if (!(await exists(file))) failures.push(`missing required file: ${file}`);
}

const tsconfig = JSON.parse(await readFile(join(root, 'tsconfig.base.json'), 'utf8'));
if (tsconfig.compilerOptions?.strict !== true) failures.push('TypeScript strict mode is not enabled');
if (tsconfig.compilerOptions?.noUncheckedIndexedAccess !== true) {
  failures.push('noUncheckedIndexedAccess is not enabled');
}

const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
for (const script of ['typecheck', 'lint', 'test:unit', 'test:e2e', 'test:python', 'test:phase0']) {
  if (!pkg.scripts?.[script]) failures.push(`missing root script: ${script}`);
}

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (['.git', 'node_modules', '.venv', 'dist', 'coverage'].includes(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else out.push(full);
  }
  return out;
}

const secretPatterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /AIza[0-9A-Za-z\-_]{30,}/,
  /gh[pousr]_[A-Za-z0-9_]{30,}/,
];

for (const file of await walk(root)) {
  const rel = relative(root, file);
  if (rel === '.env.example') continue;
  let text;
  try {
    text = await readFile(file, 'utf8');
  } catch {
    continue;
  }
  for (const pattern of secretPatterns) {
    if (pattern.test(text)) failures.push(`possible secret in ${rel}`);
  }
}

if (failures.length) {
  console.error('Phase 0 audit FAILED');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Phase 0 audit PASSED (${required.length} required artifacts, strict TS, scripts, secret scan)`);
