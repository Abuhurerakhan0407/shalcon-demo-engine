import { readFile } from 'node:fs/promises';

async function text(path) {
  return readFile(path, 'utf8');
}

function requireText(source, needle, label) {
  if (!source.includes(needle)) throw new Error(`Phase 12 audit missing ${label}.`);
}

const [
  migration,
  auditAgent,
  auditAgentTests,
  researchRunner,
  researchResult,
  auditService,
  auditRoutes,
  apiIndex,
  integration,
  verifier,
  phase,
] = await Promise.all([
  text('apps/api/migrations/0009_website_opportunity_audit.sql'),
  text('packages/agents/src/website-audit.ts'),
  text('packages/agents/src/website-audit.test.ts'),
  text('apps/local-runner/src/shalcon_runner/research.py'),
  text('apps/api/src/research-result.ts'),
  text('apps/api/src/website-audit.ts'),
  text('apps/api/src/website-audit-routes.ts'),
  text('apps/api/src/index.ts'),
  text('apps/api/src/phase12.integration.ts'),
  text('scripts/verify-phase12-d1.mjs'),
  text('apps/api/src/phase.ts'),
]);

for (const [needle, label] of [
  ['CREATE TABLE IF NOT EXISTS website_audit_runs', 'website audit run history'],
  ['CREATE TABLE IF NOT EXISTS website_audit_observations', 'website audit observations'],
  ['source_record_id TEXT NOT NULL REFERENCES source_records', 'source evidence foreign key'],
  ['supported_by_capture INTEGER NOT NULL DEFAULT 1', 'capture-support invariant'],
  ['WEBSITE_AUDIT_OBSERVATION_SOURCE_MISMATCH', 'observation/source prospect guard'],
]) requireText(migration, needle, label);

for (const [needle, label] of [
  ['assessWebsiteOpportunity', 'deterministic website opportunity assessment'],
  ["websitePresence: 'NOT_FOUND'", 'website-not-found state'],
  ['not proof that the business has no website', 'no unsupported no-website claim'],
  ['CTA_NOT_DETECTED', 'CTA audit'],
  ['CONTACT_PATH_NOT_DETECTED', 'contact-path audit'],
  ['BOOKING_PATH_NOT_DETECTED', 'booking-path audit'],
  ['SERVICES_PRESENTATION_THIN', 'service presentation audit'],
  ['DESKTOP_HORIZONTAL_OVERFLOW', 'desktop layout audit'],
  ['MOBILE_HORIZONTAL_OVERFLOW', 'mobile layout audit'],
  ['BROWSER_ERROR_SIGNAL', 'browser diagnostics audit'],
  ["if (rating === 'GOOD') return 'SKIP_DEMO'", 'strong-site skip policy'],
]) requireText(auditAgent, needle, label);

for (const [needle, label] of [
  ['strong captured website as a skip rather than manufacturing criticism', 'good-site regression'],
  ['does not turn missing website evidence into a factual no-website claim', 'missing-site wording regression'],
  ['links supported mobile layout criticism to the captured mobile screenshot', 'mobile screenshot regression'],
]) requireText(auditAgentTests, needle, label);

for (const [needle, label] of [
  ['mobileScreenshotPath', 'mobile screenshot capture'],
  ['viewportAudit', 'viewport audit metrics'],
  ['page.set_viewport_size({"width": 390, "height": 844})', 'mobile viewport capture'],
  ['hasHorizontalOverflow', 'horizontal overflow metric'],
]) requireText(researchRunner, needle, label);

requireText(researchResult, 'mobileScreenshotPath', 'cloud mobile screenshot schema');
requireText(researchResult, 'viewportAuditSchema', 'cloud viewport audit schema');

for (const [needle, label] of [
  ['runWebsiteOpportunityAudit', 'audit execution service'],
  ['latestBatch', 'latest capture batch selection'],
  ['assessWebsiteOpportunity(sources)', 'evidence assessment invocation'],
  ['INSERT INTO website_audit_runs', 'audit run persistence'],
  ['INSERT INTO website_audit_observations', 'observation persistence'],
  ['getWebsiteAuditHistory', 'audit history'],
  ['getWebsiteAuditObservations', 'observation history'],
]) requireText(auditService, needle, label);

for (const [needle, label] of [
  ["post('/prospects/:id/runs'", 'audit run API'],
  ["get('/prospects/:id/runs'", 'audit history API'],
  ["get('/runs/:id/observations'", 'audit observation API'],
  ['evidenceBackedOnly: true', 'API evidence-backed declaration'],
]) requireText(auditRoutes, needle, label);

for (const [needle, label] of [
  ["import { websiteAuditRoutes } from './website-audit-routes';", 'website audit route import'],
  ["app.use('/api/v1/audits/*', requireAuth);", 'website audit auth boundary'],
  ["app.route('/api/v1/audits/website', websiteAuditRoutes);", 'website audit route mount'],
]) requireText(apiIndex, needle, label);

for (const [needle, label] of [
  ['goodWebsiteCanBeSkipped', 'good-site acceptance'],
  ['noUnsupportedCriticism', 'unsupported-criticism acceptance'],
  ['observationsLinkToEvidence', 'evidence-link acceptance'],
  ['mobileObservationLinksScreenshot', 'mobile screenshot acceptance'],
  ['poorWebsiteIsDemoWorthy', 'poor-site acceptance'],
  ['repeatRunsTraceable', 'repeat-run history acceptance'],
  ['missingWebsiteIsNotOverclaimed', 'missing-site acceptance'],
  ['auditDoesNotAdvanceProspectState', 'pipeline-state isolation acceptance'],
]) requireText(integration, needle, label);

requireText(verifier, 'checks.noUnsupportedCriticism === true', 'D1 unsupported-criticism gate');
requireText(verifier, 'checks.foreignKeyViolations === 0', 'D1 foreign-key gate');
const phaseMatch = phase.match(/CURRENT_PHASE\s*=\s*(\d+)/u);
if (!phaseMatch || Number(phaseMatch[1]) < 12) {
  throw new Error('Phase 12 audit requires runtime phase 12 or later.');
}

console.log('Phase 12 audit passed.');
