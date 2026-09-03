import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { URL } from 'node:url';
import { gunzipSync } from 'node:zlib';

const sourcePath = new URL('../packages/templates/source/elane-v8/original.html.gz.b64', import.meta.url);
const outputDirectory = new URL('../packages/templates/generated/elane-v8/', import.meta.url);
const outputPath = new URL('index.html', outputDirectory);
const expectedHash = 'ed9e8d651e0d24a759968f10febdb43d8ea7d036e53727d3cee8521ad7886dbf';
const runtimeSourcePath = new URL('../packages/template-runtime/source/elane-runtime-v8.ts.gz.b64', import.meta.url);
const runtimeOutputPath = new URL('../packages/template-runtime/src/index.ts', import.meta.url);
const expectedRuntimeHash = 'e414630a70a73147b7867f2fc91d3d9237a3b878456fcfe979cc3b16264ae639';

function replaceExactlyOnce(source, search, replacement, label) {
  const first = source.indexOf(search);
  const last = source.lastIndexOf(search);
  if (first === -1 || first !== last) {
    throw new Error(`ÉLANE preparation failed: ${label} must occur exactly once.`);
  }
  return `${source.slice(0, first)}${replacement}${source.slice(first + search.length)}`;
}

const compressedBase64 = (await readFile(sourcePath, 'utf8')).trim();
const original = gunzipSync(Buffer.from(compressedBase64, 'base64')).toString('utf8');
const actualHash = createHash('sha256').update(original).digest('hex');
if (actualHash !== expectedHash) {
  throw new Error(`ÉLANE source fingerprint mismatch: ${actualHash}`);
}

let adapted = original;
adapted = replaceExactlyOnce(
  adapted,
  '<html lang="en">',
  '<html lang="en" data-template-id="elane-v8" data-template-version="8.0.0">',
  'html template metadata',
);
adapted = replaceExactlyOnce(
  adapted,
  '<meta name="description" content="Fictional premium salon and spa concept with a mobile-first cinematic scroll experience.">',
  '<meta name="description" content="Fictional premium salon and spa concept with a mobile-first cinematic scroll experience.">\n<meta name="robots" content="noindex,nofollow,noarchive">\n<meta name="shalcon-template" content="elane-v8@8.0.0">\n<style id="shalcon-runtime-safety">[hidden]{display:none!important}</style>',
  'head metadata hook',
);
adapted = replaceExactlyOnce(
  adapted,
  '<script>\n(()=>{\'use strict\';',
  '<!-- SHALCON_RUNTIME_CONFIG -->\n<script>\n(()=>{\'use strict\';',
  'runtime insertion marker',
);
adapted = replaceExactlyOnce(
  adapted,
  'const data={reset:',
  'const data=window.__SHALCON_FINDER_DATA__||{reset:',
  'finder runtime hook',
);
adapted = replaceExactlyOnce(
  adapted,
  'Salon + Spa · Fictional sample',
  'Concept preview prepared by Shalcon Intelligence',
  'footer disclosure',
);
adapted = replaceExactlyOnce(
  adapted,
  'Demo only — production would submit this to the salon’s booking channel.',
  'Concept demo — booking remains inactive until the business approves a production connection.',
  'booking disclosure',
);

const runtimeCompressedBase64 = (await readFile(runtimeSourcePath, 'utf8')).trim();
const runtimeSource = gunzipSync(Buffer.from(runtimeCompressedBase64, 'base64')).toString('utf8');
const runtimeHash = createHash('sha256').update(runtimeSource).digest('hex');
if (runtimeHash !== expectedRuntimeHash) {
  throw new Error(`ÉLANE runtime fingerprint mismatch: ${runtimeHash}`);
}

const generatedRuntime = `${runtimeSource}\n\nexport const ELANE_V8_DOCUMENT_SOURCE = ${JSON.stringify(adapted)};\n`;

await mkdir(outputDirectory, { recursive: true });
await writeFile(outputPath, adapted, 'utf8');
await writeFile(runtimeOutputPath, generatedRuntime, 'utf8');
console.log(`Prepared ÉLANE v8 from verified source ${expectedHash.slice(0, 12)}… and runtime ${expectedRuntimeHash.slice(0, 12)}…`);
