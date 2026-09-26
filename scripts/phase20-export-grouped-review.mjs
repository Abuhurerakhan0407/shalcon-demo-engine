import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const base = process.env.PHASE20_OPERATOR_BASE_URL ?? 'http://127.0.0.1:8787';
const baseUrl = new globalThis.URL(base);
if (!new Set(['127.0.0.1', 'localhost']).has(baseUrl.hostname)) {
  throw new Error('Phase 20 grouped review export is local-operator only.');
}

const outArg = process.argv.find((arg) => arg.startsWith('--out='));
const outputPath = resolve(outArg ? outArg.slice('--out='.length) : 'phase20-grouped-review.json');

async function request(path) {
  const response = await globalThis.fetch(`${base}${path}`);
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}: ${text}`);
  return body;
}

function normalizedValue(value) {
  return value.trim().replace(/\s+/gu, ' ').toLocaleLowerCase('en-IN');
}

const [health, list, status, preview] = await Promise.all([
  request('/phase20/operator-health'),
  request('/api/v1/prospects'),
  request('/phase20/status'),
  request('/api/v1/evidence-auditor/preview'),
]);

if (health?.ok !== true || health.phase !== 20 || health.productionAllowed !== false) {
  throw new Error('Phase 20 local operator shell is not fail-closed.');
}
if (status.trialResultsModified !== false || status.foreignKeyViolations !== 0) {
  throw new Error('Refusing grouped export from a dirty Phase 20 workspace.');
}

const recommendationByEvidenceId = new Map();
for (const plan of preview.plans ?? []) {
  for (const item of plan.recommendations ?? []) {
    if (item.action === 'HUMAN_REQUIRED') recommendationByEvidenceId.set(item.evidenceId, item);
  }
}

const prospects = [];
const reasons = new Map();
let rawHumanEvidenceCount = 0;
let groupedDecisionCount = 0;
let identityFirstProspectCount = 0;

for (const prospect of list.prospects ?? []) {
  const bundle = await request(`/api/v1/prospects/${prospect.id}/evidence-bundle`);
  const groups = new Map();
  for (const evidence of bundle.evidence ?? []) {
    const recommendation = recommendationByEvidenceId.get(evidence.id);
    if (!recommendation) continue;
    rawHumanEvidenceCount += 1;
    reasons.set(recommendation.reasonCode, (reasons.get(recommendation.reasonCode) ?? 0) + 1);
    const key = `${evidence.field.toLocaleLowerCase('en-IN')}\u0000${normalizedValue(evidence.value)}`;
    const group = groups.get(key) ?? {
      field: evidence.field,
      value: evidence.value,
      reasonCodes: new Set(),
      members: [],
    };
    group.reasonCodes.add(recommendation.reasonCode);
    group.members.push({
      evidenceId: evidence.id,
      sourceUrl: evidence.sourceUrl,
      sourceQuality: evidence.sourceQuality,
      confidence: evidence.confidence,
      verificationStatus: evidence.verificationStatus,
      excerpt: evidence.excerpt ?? null,
    });
    groups.set(key, group);
  }

  const groupedEvidence = [...groups.values()].map((group) => ({
    field: group.field,
    value: group.value,
    reasonCodes: [...group.reasonCodes].sort(),
    memberCount: group.members.length,
    members: group.members,
  }));
  groupedDecisionCount += groupedEvidence.length;
  const identityGroups = groupedEvidence.filter(
    (group) => group.field.toLocaleLowerCase('en-IN') === 'businessname',
  );
  if (prospect.currentState === 'RESEARCH_PENDING' && identityGroups.length > 0) {
    identityFirstProspectCount += 1;
  }

  prospects.push({
    id: prospect.id,
    canonicalName: prospect.canonicalName,
    currentState: prospect.currentState,
    domain: prospect.domain ?? null,
    groupedHumanEvidence: groupedEvidence,
    identityFirst: identityGroups,
  });
}

const packet = {
  phase: 20,
  mode: 'LOCAL_OPERATOR_GROUPED_REVIEW',
  generatedAt: new Date().toISOString(),
  prospectCount: prospects.length,
  rawHumanEvidenceCount,
  groupedDecisionCount,
  duplicateReduction: rawHumanEvidenceCount - groupedDecisionCount,
  identityFirstProspectCount,
  reasonCounts: Object.fromEntries([...reasons.entries()].sort((a, b) => b[1] - a[1])),
  trialResultsModified: false,
  foreignKeyViolations: 0,
  prospects,
};

await writeFile(outputPath, `${JSON.stringify(packet, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  ok: true,
  outputPath,
  prospectCount: packet.prospectCount,
  rawHumanEvidenceCount,
  groupedDecisionCount,
  duplicateReduction: packet.duplicateReduction,
  identityFirstProspectCount,
}, null, 2));
