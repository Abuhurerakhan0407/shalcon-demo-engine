import { readFile } from 'node:fs/promises';
import { URL } from 'node:url';

const path = new URL('../docs/phase20-salon-accuracy-trial.json', import.meta.url);
const trial = JSON.parse(await readFile(path, 'utf8'));
const enforce = process.argv.includes('--enforce');

function fail(message) {
  console.error(`Phase 20 trial gate: ${message}`);
  process.exitCode = 1;
}

if (trial.phase !== 20) fail(`expected phase 20, found ${trial.phase}`);
if (!Array.isArray(trial.prospects) || trial.prospects.length !== 20) {
  fail(`expected exactly 20 prospects, found ${trial.prospects?.length ?? 0}`);
}

const ids = new Set();
const identities = new Set();
for (const prospect of trial.prospects ?? []) {
  if (!prospect.id || ids.has(prospect.id)) fail(`duplicate or missing prospect id: ${prospect.id ?? '<missing>'}`);
  ids.add(prospect.id);
  const identity = `${prospect.businessName ?? ''}|${prospect.location ?? ''}`.toLowerCase();
  if (!prospect.businessName || !prospect.location || identities.has(identity)) {
    fail(`duplicate or incomplete business identity: ${identity}`);
  }
  identities.add(identity);
  if (!prospect.sourceUrl || !/^https:\/\//u.test(prospect.sourceUrl)) {
    fail(`missing public source URL for ${prospect.id}`);
  }
}

const official = trial.prospects.filter((prospect) => prospect.sourceClass === 'OFFICIAL_WEBSITE').length;
const listingLed = trial.prospects.filter((prospect) => prospect.sourceClass === 'PUBLIC_LISTING').length;
const completed = trial.prospects.filter((prospect) => prospect.result?.status === 'COMPLETE');
const pending = trial.prospects.length - completed.length;
const zeroFactualCorrection = completed.filter((prospect) => prospect.result?.factualCorrectionRequired === false).length;
const criticalErrors = completed.filter((prospect) => prospect.result?.criticalFactualError === true).length;

console.log(JSON.stringify({
  phase: trial.phase,
  cohort: trial.prospects.length,
  officialWebsiteSources: official,
  listingLedSources: listingLed,
  completed: completed.length,
  pending,
  zeroFactualCorrection,
  criticalFactualErrors: criticalErrors,
  targetZeroFactualCorrection: trial.gate.minimumZeroFactualCorrection,
}, null, 2));

if (enforce) {
  if (pending !== 0) fail(`cannot close trial with ${pending} pending prospect(s)`);
  if (zeroFactualCorrection < trial.gate.minimumZeroFactualCorrection) {
    fail(`only ${zeroFactualCorrection}/20 required zero factual correction; target is ${trial.gate.minimumZeroFactualCorrection}/20`);
  }
  if (criticalErrors > trial.gate.criticalFactualErrorsAllowed) {
    fail(`${criticalErrors} critical factual error(s) recorded; allowed ${trial.gate.criticalFactualErrorsAllowed}`);
  }
  if (process.exitCode !== 1) console.log('Phase 20 accuracy gate passed.');
} else if (pending > 0) {
  console.log('Phase 20 cohort is valid; real trial results are still pending.');
}
