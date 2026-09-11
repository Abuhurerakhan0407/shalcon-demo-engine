import {
  EvidenceRepository,
  ProspectFactRepository,
  ProspectRepository,
  type D1DatabaseLike,
  type EvidenceRecord,
} from '@shalcon/db';
import {
  calculateDemoWorthiness,
  type DemoWorthinessScore,
  type ScoreReference,
} from '@shalcon/scoring';
import { assertProspectTransition } from '@shalcon/state-machine';

const SCORE_TYPE = 'DEMO_WORTHINESS_V1';

const NICHE_SIGNAL_FIELDS = new Set(['service', 'category', 'businesscategory', 'niche']);
const BRAND_SIGNAL_FIELDS = new Set([
  'description',
  'service',
  'sociallink',
  'brandpositioning',
  'brandidentity',
]);
const CAPACITY_SIGNAL_FIELDS = new Set([
  'premiumpositioning',
  'multiplelocations',
  'publicadvertising',
  'highvalueservice',
  'strongreviewactivity',
  'physicalpresentation',
  'bookingsoftware',
  'websiteinvestment',
  'hiringgrowth',
  'premiummarketpositioning',
  'abilitysignal',
]);
const DIRECT_CONTACT_FIELDS = new Set(['phone', 'email', 'whatsapp', 'whatsappphone']);
const SOCIAL_CONTACT_FIELDS = new Set(['sociallink']);
const RECENT_ACTIVITY_FIELDS = new Set(['recentactivity', 'activitydate', 'hiringgrowth']);

interface WebsiteAuditRow {
  id: string;
  recommendation: 'SKIP_DEMO' | 'LOW_PRIORITY' | 'DEMO_WORTHY' | 'RESEARCH_NEEDED';
  source_ids_json: string;
  created_at: string;
}

interface ScoreRow {
  id: string;
  prospect_id: string;
  total: number;
  breakdown_json: string;
  evidence_ids_json: string;
  created_at: string;
}

export interface DemoWorthinessRun {
  id: string;
  prospectId: string;
  scoreType: typeof SCORE_TYPE;
  score: DemoWorthinessScore;
  createdAt: string;
}

function normalized(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/gu, '');
}

function evidenceReferences(
  evidence: readonly EvidenceRecord[],
  fields: ReadonlySet<string>,
): ScoreReference[] {
  return evidence
    .filter((item) => fields.has(normalized(item.field)))
    .map((item) => ({ kind: 'EVIDENCE' as const, id: item.id }));
}

function parseStringArray(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return [...new Set(parsed.filter((item): item is string => typeof item === 'string' && item.length > 0))];
  } catch {
    return [];
  }
}

function scoreReferenceIds(score: DemoWorthinessScore): string[] {
  return [
    ...new Set(
      Object.values(score.components)
        .flatMap((component) => component.references)
        .filter((reference) => reference.kind === 'EVIDENCE')
        .map((reference) => reference.id),
    ),
  ];
}

function scoreId(): string {
  return `score_${crypto.randomUUID().replaceAll('-', '')}`;
}

function parseScoreRow(row: ScoreRow): DemoWorthinessRun {
  const score = JSON.parse(row.breakdown_json) as DemoWorthinessScore;
  return {
    id: row.id,
    prospectId: row.prospect_id,
    scoreType: SCORE_TYPE,
    score,
    createdAt: row.created_at,
  };
}

async function latestWebsiteAudit(
  db: D1DatabaseLike,
  userId: string,
  prospectId: string,
): Promise<WebsiteAuditRow | null> {
  return db
    .prepare(`
      SELECT id, recommendation, source_ids_json, created_at
      FROM website_audit_runs
      WHERE prospect_id = ? AND user_id = ? AND status = 'COMPLETED'
      ORDER BY completed_at DESC, created_at DESC, id DESC
      LIMIT 1
    `)
    .bind(prospectId, userId)
    .first<WebsiteAuditRow>();
}

export async function runDemoWorthinessScoring(
  db: D1DatabaseLike,
  userId: string,
  prospectId: string,
  now = new Date().toISOString(),
): Promise<DemoWorthinessRun> {
  const prospects = new ProspectRepository(db);
  const prospect = await prospects.getByIdForUser(prospectId, userId);
  if (!prospect) throw new Error('Prospect not found.');
  if (prospect.currentState !== 'AUDITED') {
    throw new Error(`Demo worthiness scoring requires AUDITED state; found ${prospect.currentState}.`);
  }

  const audit = await latestWebsiteAudit(db, userId, prospect.id);
  if (!audit) throw new Error('A completed website audit is required before scoring.');

  const [evidence, facts] = await Promise.all([
    new EvidenceRepository(db).listForProspect(prospect.id),
    new ProspectFactRepository(db).listForProspect(prospect.id),
  ]);
  const evidenceById = new Map(evidence.map((item) => [item.id, item]));
  const verifiedDataReferences: ScoreReference[] = [
    ...new Set(
      facts
        .filter(
          (fact) =>
            fact.verificationStatus === 'VERIFIED' &&
            fact.evidenceId !== null &&
            evidenceById.has(fact.evidenceId),
        )
        .map((fact) => fact.evidenceId)
        .filter((id): id is string => id !== null),
    ),
  ].map((id) => ({ kind: 'EVIDENCE' as const, id }));

  const websiteReferences: ScoreReference[] = [
    { kind: 'AUDIT_RUN', id: audit.id },
    ...parseStringArray(audit.source_ids_json).map((id) => ({ kind: 'SOURCE' as const, id })),
  ];

  const score = calculateDemoWorthiness({
    nicheMatched: normalized(prospect.niche) === 'salonspa',
    nicheReferences: evidenceReferences(evidence, NICHE_SIGNAL_FIELDS),
    websiteRecommendation: audit.recommendation,
    websiteReferences,
    verifiedDataReferences,
    brandSignalReferences: evidenceReferences(evidence, BRAND_SIGNAL_FIELDS),
    abilityToPaySignalReferences: evidenceReferences(evidence, CAPACITY_SIGNAL_FIELDS),
    directContactReferences: evidenceReferences(evidence, DIRECT_CONTACT_FIELDS),
    socialContactReferences: evidenceReferences(evidence, SOCIAL_CONTACT_FIELDS),
    recentActivityReferences: evidenceReferences(evidence, RECENT_ACTIVITY_FIELDS),
  });

  assertProspectTransition('AUDITED', 'SCORED');
  assertProspectTransition('SCORED', score.decision);

  const id = scoreId();
  const evidenceIds = scoreReferenceIds(score);
  const writes = await db.batch([
    db
      .prepare(`
        INSERT INTO scores(id, prospect_id, score_type, total, breakdown_json, evidence_ids_json, created_at)
        SELECT ?, ?, ?, ?, ?, ?, ?
        WHERE EXISTS (SELECT 1 FROM prospects WHERE id = ? AND current_state = 'AUDITED')
      `)
      .bind(
        id,
        prospect.id,
        SCORE_TYPE,
        score.total,
        JSON.stringify(score),
        JSON.stringify(evidenceIds),
        now,
        prospect.id,
      ),
    db
      .prepare(`
        UPDATE prospects
        SET demo_score = ?, current_state = 'SCORED', updated_at = ?
        WHERE id = ? AND current_state = 'AUDITED'
      `)
      .bind(score.total, now, prospect.id),
    db
      .prepare(`
        UPDATE prospects
        SET current_state = ?, updated_at = ?
        WHERE id = ? AND current_state = 'SCORED'
      `)
      .bind(score.decision, now, prospect.id),
  ]);

  if (writes[0]?.meta?.changes !== 1) {
    throw new Error('Prospect changed concurrently; score was not persisted.');
  }
  const finalProspect = await prospects.getById(prospect.id);
  const persisted = await db
    .prepare('SELECT id FROM scores WHERE id = ? AND prospect_id = ? AND score_type = ?')
    .bind(id, prospect.id, SCORE_TYPE)
    .first<{ id: string }>();
  if (!persisted || finalProspect?.currentState !== score.decision) {
    throw new Error('Demo worthiness score did not reach its deterministic decision state.');
  }

  return { id, prospectId: prospect.id, scoreType: SCORE_TYPE, score, createdAt: now };
}

export async function getDemoWorthinessHistory(
  db: D1DatabaseLike,
  userId: string,
  prospectId: string,
): Promise<DemoWorthinessRun[]> {
  const prospect = await new ProspectRepository(db).getByIdForUser(prospectId, userId);
  if (!prospect) throw new Error('Prospect not found.');
  const rows = await db
    .prepare(`
      SELECT id, prospect_id, total, breakdown_json, evidence_ids_json, created_at
      FROM scores
      WHERE prospect_id = ? AND score_type = ?
      ORDER BY created_at DESC, id DESC
      LIMIT 50
    `)
    .bind(prospectId, SCORE_TYPE)
    .all<ScoreRow>();
  return rows.results.map(parseScoreRow);
}
