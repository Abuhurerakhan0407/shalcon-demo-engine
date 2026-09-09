import { readFile } from 'node:fs/promises';

async function text(path) {
  return readFile(path, 'utf8');
}

function requireText(source, needle, label) {
  if (!source.includes(needle)) throw new Error(`Phase 11 audit missing ${label}.`);
}

const [
  migration,
  agent,
  agentTests,
  orchestration,
  aiRoutes,
  researchRoutes,
  integration,
  verifier,
  phase,
  researchUi,
] = await Promise.all([
  text('apps/api/migrations/0008_automated_research_evidence.sql'),
  text('packages/agents/src/research.ts'),
  text('packages/agents/src/research.test.ts'),
  text('apps/api/src/research-agent.ts'),
  text('apps/api/src/ai-runner-routes.ts'),
  text('apps/api/src/research-runner-routes.ts'),
  text('apps/api/src/phase11.integration.ts'),
  text('scripts/verify-phase11-d1.mjs'),
  text('apps/api/src/phase.ts'),
  text('apps/web/src/research/ResearchPage.tsx'),
]);

for (const [needle, label] of [
  ['CREATE TABLE IF NOT EXISTS research_runs', 'research run audit table'],
  ['CREATE TABLE IF NOT EXISTS research_run_jobs', 'research run job provenance table'],
  ['CREATE TABLE IF NOT EXISTS research_run_evidence', 'research run evidence provenance table'],
  ['RESEARCH_RUN_JOB_PROSPECT_MISMATCH', 'run/job prospect guard'],
  ['RESEARCH_RUN_EVIDENCE_PROSPECT_MISMATCH', 'run/evidence prospect guard'],
  ['research_run_job_terminal_failure', 'terminal extraction failure propagation'],
  ['research_run_job_block_completion_after_failure', 'failed-run completion guard'],
]) requireText(migration, needle, label);

for (const [needle, label] of [
  ['prioritizeResearchSources', 'page prioritization'],
  ['safeLimit', 'bounded page selection'],
  ['extractionToEvidenceCandidates', 'structured candidate extraction'],
  ["verificationStatus: confidence >= 0.8 ? 'PROBABLE' : 'UNVERIFIED'", 'no automatic verification'],
  ['detectResearchConflicts', 'cross-source comparison'],
  ['CRITICAL_FIELDS', 'critical conflict policy'],
  ['hasCriticalResearchConflict', 'pipeline conflict stop'],
]) requireText(agent, needle, label);

requireText(agentTests, 'prioritizes contact/services/home research pages deterministically', 'page-priority regression');
requireText(agentTests, 'never auto-verifies', 'verification regression');
requireText(agentTests, 'critical scalar conflicts', 'conflict regression');

for (const [needle, label] of [
  ["source.provider !== 'PLAYWRIGHT'", 'Playwright-source boundary'],
  ['prioritizeResearchSources', 'orchestrated page prioritization'],
  ['job_type, entity_id', 'job creation'],
  ["'LOCAL_AI_EXTRACT'", 'local AI extraction jobs'],
  ['sourceRecordId', 'single-source extraction binding'],
  ['activeLeaseSql', 'active lease persistence guard'],
  ['INSERT INTO evidence', 'candidate evidence persistence'],
  ['research_run_evidence', 'run-to-evidence audit links'],
  ['detectResearchConflicts', 'cross-source conflict finalization'],
  ["blocked ? 'BLOCKED' : 'COMPLETED'", 'critical conflict stop state'],
  ["transition(prospectId, 'RESEARCHED'", 'clean research state transition'],
  ['verifiedFactPromotion: false', 'no fact promotion invariant'],
]) requireText(orchestration, needle, label);

if (orchestration.includes('ProspectFactRepository')) {
  throw new Error('Phase 11 automated research must not write canonical facts directly.');
}

requireText(aiRoutes, 'completePhase11ResearchExtraction', 'dedicated Phase 11 AI completion path');
requireText(aiRoutes, 'verifiedFactPromotion: false', 'cloud no-promotion response');
requireText(researchRoutes, 'startPhase11Research', 'Playwright-to-AI research chaining');

for (const [needle, label] of [
  ['visibleCandidatesHaveEvidence', 'visible evidence acceptance'],
  ['criticalConflictStopsPipeline', 'critical conflict acceptance'],
  ['lowConfidenceStaysUnverified', 'low-confidence acceptance'],
  ['rerunPreservesAuditHistory', 'rerun history acceptance'],
  ['aiDidNotOverwriteCanonicalFacts', 'canonical fact protection acceptance'],
]) requireText(integration, needle, label);

requireText(verifier, 'checks.foreignKeyViolations === 0', 'foreign key verification');
requireText(verifier, 'checks.criticalConflictStopsPipeline === true', 'D1 conflict gate');
requireText(phase, 'CURRENT_PHASE = 11', 'runtime Phase 11 marker');

for (const [needle, label] of [
  ['AUTOMATED RESEARCH + EVIDENCE', 'research UI'],
  ['Open evidence source', 'source provenance UI'],
  ['Probability is not verification.', 'verification warning UI'],
  ['Conflicting candidate evidence', 'conflict UI'],
]) requireText(researchUi, needle, label);

console.log('Phase 11 audit passed.');
