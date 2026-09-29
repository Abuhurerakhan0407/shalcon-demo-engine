import {
  DemoRepository,
  ProspectFactRepository,
  ProspectRepository,
  type D1DatabaseLike,
} from '@shalcon/db';
import { assertProspectTransition, type ProspectState } from '@shalcon/state-machine';

export const PHASE21_COPY_VERSION = 'phase21-permission-first.v1' as const;
export const PHASE21_MESSAGE_TYPE = 'PERMISSION_FIRST_DRAFT_V1' as const;

interface CampaignRow {
  id: string;
  status: string;
  approval_mode: string;
  email_account_id: string | null;
  daily_send_limit: number;
}

interface ContactRow {
  id: string;
  prospect_id: string;
  phone: string | null;
  verification_status: string;
  source: string;
  confidence: number | null;
  evidence_ids_json: string;
  created_at: string;
}

interface MessageRow {
  id: string;
  prospect_id: string;
  demo_id: string | null;
  contact_id: string | null;
  campaign_id: string;
  type: string;
  subject: string | null;
  body: string;
  evidence_ids_json: string;
  qa_status: string;
  approval_status: string;
  created_at: string;
}

export interface Phase21Draft {
  body: string;
  evidenceIds: string[];
  locationPersonalized: boolean;
}

export interface Phase21CopyQa {
  passed: boolean;
  checks: {
    businessNamePresent: boolean;
    locationClaimBacked: boolean;
    noPublicUrlClaim: boolean;
    permissionFirstCta: boolean;
    concise: boolean;
  };
}

export function extractVerifiedPhoneCandidates(value: string): string[] {
  const out = new Set<string>();
  for (const part of value.split(/\s*\/\s*|\s*,\s*/u)) {
    const compact = part.trim().replace(/[^+\d]/gu, '');
    if (!compact) continue;
    const digits = compact.replace(/\D/gu, '');
    if (digits.length < 8 || digits.length > 15) continue;
    out.add(compact.startsWith('+') ? `+${digits}` : digits);
  }
  return [...out];
}

export function buildPermissionFirstDraft(input: {
  businessName: string;
  businessNameEvidenceId: string;
  address?: string | null;
  addressEvidenceId?: string | null;
}): Phase21Draft {
  const bandra = /\bbandra\b/iu.test(input.address ?? '');
  const location = bandra ? ' in Bandra' : '';
  const evidenceIds = [input.businessNameEvidenceId];
  if (bandra && input.addressEvidenceId) evidenceIds.push(input.addressEvidenceId);
  return {
    body: `Hi, I’m Abu from Shalcon Intelligence. I put together a private website concept for ${input.businessName}${location}. It’s a quick redesign idea focused on a stronger first impression and a clearer enquiry path. Nothing has been published or changed publicly. If you’re open to it, I can send the concept here for a quick look — no obligation.`,
    evidenceIds,
    locationPersonalized: bandra,
  };
}

export function qaPermissionFirstDraft(input: {
  draft: Phase21Draft;
  businessName: string;
  address?: string | null;
}): Phase21CopyQa {
  const body = input.draft.body;
  const locationClaimed = /\bBandra\b/u.test(body);
  const locationBacked = !locationClaimed || /\bbandra\b/iu.test(input.address ?? '');
  const checks = {
    businessNamePresent: body.toLocaleLowerCase().includes(input.businessName.toLocaleLowerCase()),
    locationClaimBacked: locationBacked,
    noPublicUrlClaim: !/https?:\/\//iu.test(body),
    permissionFirstCta: /if you[’']re open to it, i can send the concept here/iu.test(body),
    concise: body.length <= 500,
  };
  return { passed: Object.values(checks).every(Boolean), checks };
}

function randomId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replaceAll('-', '')}`;
}

function parseJsonArray(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : [];
  } catch {
    return [];
  }
}

async function campaignForProspect(
  db: D1DatabaseLike,
  prospectId: string,
  userId: string,
): Promise<CampaignRow> {
  const row = await db
    .prepare(
      `
    SELECT campaign.id, campaign.status, campaign.approval_mode, campaign.email_account_id, campaign.daily_send_limit
    FROM campaigns campaign
    JOIN prospects prospect ON prospect.campaign_id = campaign.id
    WHERE prospect.id = ? AND campaign.user_id = ?
    LIMIT 1
  `,
    )
    .bind(prospectId, userId)
    .first<CampaignRow>();
  if (!row) throw new Error('Prospect campaign was not found for this operator.');
  return row;
}

async function isSuppressed(
  db: D1DatabaseLike,
  prospectId: string,
  domain: string | null,
): Promise<boolean> {
  const row = await db
    .prepare(
      `
    SELECT id FROM suppression_list
    WHERE prospect_id = ? OR (normalized_domain IS NOT NULL AND normalized_domain = ?)
    LIMIT 1
  `,
    )
    .bind(
      prospectId,
      domain
        ?.trim()
        .toLocaleLowerCase()
        .replace(/^www\./u, '') ?? '',
    )
    .first<{ id: string }>();
  return row !== null;
}

async function contactsForProspect(db: D1DatabaseLike, prospectId: string): Promise<ContactRow[]> {
  const result = await db
    .prepare(
      `
    SELECT id, prospect_id, phone, verification_status, source, confidence, evidence_ids_json, created_at
    FROM contacts WHERE prospect_id = ? ORDER BY created_at ASC, id ASC
  `,
    )
    .bind(prospectId)
    .all<ContactRow>();
  return result.results;
}

async function latestMessage(
  db: D1DatabaseLike,
  prospectId: string,
  demoId: string,
): Promise<MessageRow | null> {
  return db
    .prepare(
      `
    SELECT id, prospect_id, demo_id, contact_id, campaign_id, type, subject, body,
      evidence_ids_json, qa_status, approval_status, created_at
    FROM messages
    WHERE prospect_id = ? AND demo_id = ? AND type = ?
    ORDER BY created_at DESC, id DESC LIMIT 1
  `,
    )
    .bind(prospectId, demoId, PHASE21_MESSAGE_TYPE)
    .first<MessageRow>();
}

function blockedReasons(campaign: CampaignRow): string[] {
  const reasons = ['WHATSAPP_REACHABILITY_NOT_VERIFIED', 'PUBLIC_DEMO_LINK_NOT_PUBLISHED'];
  if (campaign.status !== 'ACTIVE') reasons.push('CAMPAIGN_NOT_ACTIVE');
  if (campaign.daily_send_limit <= 0) reasons.push('DAILY_SEND_LIMIT_ZERO');
  if (!campaign.email_account_id) reasons.push('NO_EMAIL_ACCOUNT_FOR_FALLBACK');
  return reasons;
}

async function transitionIf(
  prospects: ProspectRepository,
  prospectId: string,
  from: ProspectState,
  to: ProspectState,
): Promise<void> {
  const current = await prospects.getById(prospectId);
  if (!current) throw new Error('Prospect not found.');
  if (current.currentState !== from) return;
  assertProspectTransition(from, to);
  await prospects.transition(prospectId, to, new Date().toISOString());
}

export async function preparePhase21Outreach(
  db: D1DatabaseLike,
  userId: string,
  prospectId: string,
) {
  const prospects = new ProspectRepository(db);
  const prospect = await prospects.getByIdForUser(prospectId, userId);
  if (!prospect) throw new Error('Prospect not found.');
  const allowed: ProspectState[] = [
    'DEMO_READY',
    'CONTACT_PENDING',
    'CONTACT_VERIFIED',
    'COPY_PENDING',
    'COPY_QA_PENDING',
    'READY_FOR_REVIEW',
  ];
  if (!allowed.includes(prospect.currentState)) {
    throw new Error(
      `Phase 21 preparation requires a demo-ready/contact/copy state; found ${prospect.currentState}.`,
    );
  }

  const campaign = await campaignForProspect(db, prospect.id, userId);
  if (campaign.approval_mode !== 'MANUAL')
    throw new Error('Phase 21 requires MANUAL campaign approval mode.');
  if (await isSuppressed(db, prospect.id, prospect.domain))
    throw new Error('Prospect is suppressed; outreach preparation is blocked.');

  const demos = await new DemoRepository(db).listForProspectForUser(prospect.id, userId);
  const demo = demos.find(
    (item) =>
      item.status === 'READY' &&
      item.visualQaStatus === 'PASS' &&
      item.factQaStatus === 'PASS' &&
      item.salesQaStatus === 'PASS',
  );
  if (!demo)
    throw new Error('Phase 21 requires a READY demo with Visual, Fact, and Sales QA PASS.');

  const facts = await new ProspectFactRepository(db).listForProspect(prospect.id);
  const businessName = facts.find(
    (fact) =>
      fact.field === 'businessName' && fact.verificationStatus === 'VERIFIED' && fact.evidenceId,
  );
  const phone = facts.find(
    (fact) => fact.field === 'phone' && fact.verificationStatus === 'VERIFIED' && fact.evidenceId,
  );
  const address = facts.find(
    (fact) => fact.field === 'address' && fact.verificationStatus === 'VERIFIED' && fact.evidenceId,
  );
  if (!businessName?.evidenceId)
    throw new Error('Verified business name evidence is required for outreach copy.');
  if (!phone?.evidenceId)
    throw new Error('Verified phone evidence is required for contact preparation.');
  const phoneCandidates = extractVerifiedPhoneCandidates(phone.value);
  if (phoneCandidates.length === 0)
    throw new Error('Verified phone fact did not contain a sendable phone candidate.');

  await transitionIf(prospects, prospect.id, 'DEMO_READY', 'CONTACT_PENDING');
  let contacts = await contactsForProspect(db, prospect.id);
  for (const candidate of phoneCandidates) {
    if (contacts.some((item) => item.phone === candidate)) continue;
    const now = new Date().toISOString();
    await db
      .prepare(
        `
      INSERT INTO contacts(
        id, prospect_id, first_name, last_name, role, email, phone, verification_status,
        source, confidence, evidence_ids_json, created_at
      ) VALUES (?, ?, NULL, NULL, NULL, NULL, ?, 'PHONE_VERIFIED', 'VERIFIED_PROSPECT_FACT', ?, ?, ?)
    `,
      )
      .bind(
        randomId('contact'),
        prospect.id,
        candidate,
        phone.confidence,
        JSON.stringify([phone.evidenceId]),
        now,
      )
      .run();
  }
  contacts = await contactsForProspect(db, prospect.id);
  if (contacts.length === 0)
    throw new Error('Phase 21 contact persistence produced no verified contact rows.');
  await transitionIf(prospects, prospect.id, 'CONTACT_PENDING', 'CONTACT_VERIFIED');
  await transitionIf(prospects, prospect.id, 'CONTACT_VERIFIED', 'COPY_PENDING');

  const draft = buildPermissionFirstDraft({
    businessName: businessName.value,
    businessNameEvidenceId: businessName.evidenceId,
    ...(address ? { address: address.value, addressEvidenceId: address.evidenceId } : {}),
  });
  const qa = qaPermissionFirstDraft({
    draft,
    businessName: businessName.value,
    ...(address ? { address: address.value } : {}),
  });
  if (!qa.passed) throw new Error('Permission-first outreach copy failed deterministic QA.');

  let message = await latestMessage(db, prospect.id, demo.id);
  if (!message) {
    const now = new Date().toISOString();
    const messageId = randomId('message');
    await db
      .prepare(
        `
      INSERT INTO messages(
        id, prospect_id, demo_id, contact_id, campaign_id, type, subject, body,
        evidence_ids_json, qa_status, approval_status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, 'PASS', 'PENDING_REVIEW', ?)
    `,
      )
      .bind(
        messageId,
        prospect.id,
        demo.id,
        null,
        campaign.id,
        PHASE21_MESSAGE_TYPE,
        draft.body,
        JSON.stringify(draft.evidenceIds),
        now,
      )
      .run();
    message = await latestMessage(db, prospect.id, demo.id);
  }
  if (!message || message.qa_status !== 'PASS')
    throw new Error('Phase 21 message persistence or copy QA invariant failed.');

  await transitionIf(prospects, prospect.id, 'COPY_PENDING', 'COPY_QA_PENDING');
  await transitionIf(prospects, prospect.id, 'COPY_QA_PENDING', 'READY_FOR_REVIEW');
  const finalProspect = await prospects.getByIdForUser(prospect.id, userId);
  if (!finalProspect || finalProspect.currentState !== 'READY_FOR_REVIEW') {
    throw new Error('Phase 21 preparation did not reach READY_FOR_REVIEW.');
  }

  const queueCount = await db
    .prepare(
      `
    SELECT COUNT(*) AS count FROM send_queue WHERE message_id = ?
  `,
    )
    .bind(message.id)
    .first<{ count: number }>();
  if (Number(queueCount?.count ?? 0) !== 0)
    throw new Error('Phase 21 preparation must not create send queue rows.');

  return {
    prospect: finalProspect,
    demo: { id: demo.id, status: demo.status },
    contacts: contacts.map((item) => ({
      id: item.id,
      phone: item.phone,
      verificationStatus: item.verification_status,
      source: item.source,
      confidence: item.confidence,
      evidenceIds: parseJsonArray(item.evidence_ids_json),
    })),
    message: {
      id: message.id,
      type: message.type,
      body: message.body,
      qaStatus: message.qa_status,
      approvalStatus: message.approval_status,
      evidenceIds: parseJsonArray(message.evidence_ids_json),
    },
    copyQa: qa,
    sendQueueCreated: false,
    sendBlockedReasons: blockedReasons(campaign),
  };
}

export async function getPhase21ReviewQueue(db: D1DatabaseLike, userId: string) {
  const rows = await db
    .prepare(
      `
    SELECT prospect.id AS prospect_id, prospect.canonical_name, prospect.current_state,
      campaign.status AS campaign_status, campaign.approval_mode, campaign.daily_send_limit,
      campaign.email_account_id
    FROM prospects prospect
    JOIN campaigns campaign ON campaign.id = prospect.campaign_id
    WHERE campaign.user_id = ?
      AND prospect.current_state IN ('DEMO_READY','CONTACT_PENDING','CONTACT_VERIFIED','COPY_PENDING','COPY_QA_PENDING','READY_FOR_REVIEW')
    ORDER BY prospect.updated_at DESC, prospect.id DESC
  `,
    )
    .bind(userId)
    .all<{
      prospect_id: string;
      canonical_name: string;
      current_state: string;
      campaign_status: string;
      approval_mode: string;
      daily_send_limit: number;
      email_account_id: string | null;
    }>();

  const items = [];
  for (const row of rows.results) {
    const contacts = await contactsForProspect(db, row.prospect_id);
    const message = await db
      .prepare(
        `
      SELECT id, prospect_id, demo_id, contact_id, campaign_id, type, subject, body,
        evidence_ids_json, qa_status, approval_status, created_at
      FROM messages WHERE prospect_id = ? ORDER BY created_at DESC, id DESC LIMIT 1
    `,
      )
      .bind(row.prospect_id)
      .first<MessageRow>();
    items.push({
      prospectId: row.prospect_id,
      businessName: row.canonical_name,
      state: row.current_state,
      contacts: contacts.map((item) => ({
        id: item.id,
        phone: item.phone,
        verificationStatus: item.verification_status,
      })),
      message: message
        ? {
            id: message.id,
            type: message.type,
            body: message.body,
            qaStatus: message.qa_status,
            approvalStatus: message.approval_status,
            evidenceIds: parseJsonArray(message.evidence_ids_json),
          }
        : null,
      sendBlockedReasons: blockedReasons({
        id: '',
        status: row.campaign_status,
        approval_mode: row.approval_mode,
        daily_send_limit: row.daily_send_limit,
        email_account_id: row.email_account_id,
      }),
    });
  }
  return items;
}
