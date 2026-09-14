import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const base = process.env.PHASE20_OPERATOR_BASE_URL ?? 'http://127.0.0.1:8787';
const baseUrl = new globalThis.URL(base);
if (!new Set(['127.0.0.1', 'localhost']).has(baseUrl.hostname)) {
  throw new Error('Phase 20 review packets may only be exported from the local operator workspace.');
}

const outArg = process.argv.find((arg) => arg.startsWith('--out='));
const outputPath = resolve(outArg ? outArg.slice('--out='.length) : 'phase20-review-packet.json');

async function request(path) {
  const response = await globalThis.fetch(`${base}${path}`);
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }
  if (!response.ok) {
    throw new Error(`${path} returned HTTP ${response.status}: ${text}`);
  }
  return body;
}

const health = await request('/phase20/operator-health');
if (health?.ok !== true || health.phase !== 20 || health.productionAllowed !== false) {
  throw new Error('Phase 20 local operator shell is not healthy or is not fail-closed for production.');
}

const [prospectList, status] = await Promise.all([
  request('/api/v1/prospects'),
  request('/phase20/status'),
]);
if (!Array.isArray(prospectList.prospects)) {
  throw new Error('Phase 20 operator prospect list is unavailable.');
}
if (status.trialResultsModified !== false || status.foreignKeyViolations !== 0) {
  throw new Error('Refusing to export a review packet from a dirty Phase 20 workspace.');
}

const prospects = [];
for (const prospect of prospectList.prospects) {
  const [bundle, reviewTrail] = await Promise.all([
    request(`/api/v1/prospects/${prospect.id}/evidence-bundle`),
    request(`/api/v1/prospects/${prospect.id}/evidence/reviews`),
  ]);

  const unresolvedEvidence = (bundle.evidence ?? []).filter(
    (item) => item.verificationStatus === 'PROBABLE' || item.verificationStatus === 'UNVERIFIED',
  );

  prospects.push({
    id: prospect.id,
    canonicalName: prospect.canonicalName,
    city: prospect.city ?? null,
    currentState: prospect.currentState,
    unresolvedEvidence: unresolvedEvidence.map((item) => ({
      id: item.id,
      field: item.field,
      value: item.value,
      sourceUrl: item.sourceUrl,
      sourceQuality: item.sourceQuality,
      confidence: item.confidence,
      verificationStatus: item.verificationStatus,
      excerpt: item.excerpt ?? null,
    })),
    conflicts: bundle.conflicts ?? [],
    canonicalFacts: bundle.facts ?? [],
    reviewEvents: reviewTrail.events ?? [],
  });
}

const packet = {
  phase: 20,
  mode: 'LOCAL_OPERATOR_REVIEW_PACKET',
  generatedAt: new Date().toISOString(),
  trialResultsModified: false,
  foreignKeyViolations: 0,
  prospectCount: prospects.length,
  unresolvedEvidenceCount: prospects.reduce(
    (sum, prospect) => sum + prospect.unresolvedEvidence.length,
    0,
  ),
  prospects,
};

await writeFile(outputPath, `${JSON.stringify(packet, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  ok: true,
  phase: 20,
  outputPath,
  prospectCount: packet.prospectCount,
  unresolvedEvidenceCount: packet.unresolvedEvidenceCount,
  trialResultsModified: false,
}, null, 2));
