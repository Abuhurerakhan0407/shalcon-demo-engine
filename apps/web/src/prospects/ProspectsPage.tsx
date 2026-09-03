import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState, type FormEvent } from 'react';

import './prospects.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8787';

type VerificationStatus = 'VERIFIED' | 'PROBABLE' | 'CONFLICTED' | 'UNVERIFIED' | 'REJECTED';
type IdentityResolutionStatus = 'NEW_CANONICAL' | 'EXACT_MATCH' | 'REVIEW_REQUIRED' | 'CONFLICT';

interface Prospect {
  id: string;
  canonicalName: string;
  normalizedName: string;
  domain: string | null;
  phoneNormalized: string | null;
  city: string | null;
  addressNormalized?: string | null;
  currentState: string;
  updatedAt: string;
}

interface SourceRecord {
  id: string;
  provider: string;
  sourceType: string;
  sourceUrl: string;
  capturedAt: string;
}

interface EvidenceRecord {
  id: string;
  field: string;
  value: string;
  sourceRecordId: string;
  sourceUrl: string;
  sourceQuality: number;
  confidence: number;
  verificationStatus: VerificationStatus;
  excerpt: string | null;
}

interface FactRecord {
  id: string;
  field: string;
  value: string;
  verificationStatus: VerificationStatus;
  confidence: number;
  evidenceId: string | null;
}

interface ConflictSummary {
  field: string;
  conflicted: boolean;
  candidates: Array<{
    value: string;
    evidenceIds: string[];
    bestConfidence: number;
    bestSourceQuality: number;
  }>;
}

interface EvidenceBundle {
  prospect: Prospect;
  sources: SourceRecord[];
  evidence: EvidenceRecord[];
  facts: FactRecord[];
  conflicts: ConflictSummary[];
}

interface IdentityKey {
  type: 'DOMAIN' | 'PHONE' | 'NAME_CITY' | 'ADDRESS_CITY';
  value: string;
}

interface IdentityResolution {
  status: IdentityResolutionStatus;
  confidence: number;
  candidateProspectIds: string[];
  matchedKeys: IdentityKey[];
  reasonCodes: string[];
}

interface RegisteredIdentityKey {
  id: string;
  keyType: IdentityKey['type'];
  keyValue: string;
  keyStrength: 'STRONG' | 'WEAK';
  sourceType: string;
}

interface IdentityObservation {
  id: string;
  observedName: string;
  resolutionStatus: IdentityResolutionStatus;
  confidence: number;
  sourceType: string;
  reasonCodes: string[];
  createdAt: string;
}

interface ProspectAlias {
  duplicateProspectId: string;
  canonicalProspectId: string;
  reasonCode: string;
  confidence: number;
}

interface IdentityBundle {
  prospect: Prospect;
  liveResolution: IdentityResolution;
  registeredKeys: RegisteredIdentityKey[];
  latestResolution: {
    status: string;
    confidence: number;
    reasonCodesJson: string;
    createdAt: string;
  } | null;
  observations: IdentityObservation[];
  alias: ProspectAlias | null;
  aliases: ProspectAlias[];
  candidateProspects: Prospect[];
}

interface CreateProspectResponse {
  prospect: Prospect;
  identity?: IdentityResolution & {
    deduplicated: boolean;
    canonicalProspectId: string | null;
    pendingProspectId: string | null;
    aliasProspectId: string | null;
  };
}

interface IdentityDecisionResponse {
  prospect: Prospect;
  canonical: Prospect;
  decision: 'LINK_TO_EXISTING' | 'KEEP_DISTINCT';
}

async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    throw new Error(payload?.error?.message ?? `Request failed with ${response.status}.`);
  }
  return response.json() as Promise<T>;
}

function StatusBadge({ status }: { status: VerificationStatus }) {
  return <span className={`evidence-status status-${status.toLowerCase()}`}>{status}</span>;
}

function EmptyEvidence() {
  return (
    <div className="evidence-empty">
      <strong>No evidence captured yet.</strong>
      <p>
        Research sources will appear here with confidence and provenance. Nothing is treated as
        fact by default.
      </p>
    </div>
  );
}

function formText(data: FormData, key: string): string {
  const value = data.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

function identityLabel(status: IdentityResolutionStatus): string {
  if (status === 'EXACT_MATCH') return 'Exact match';
  if (status === 'REVIEW_REQUIRED') return 'Review required';
  if (status === 'CONFLICT') return 'Strong conflict';
  return 'New canonical';
}

function humanReason(reason: string): string {
  const labels: Record<string, string> = {
    DOMAIN_EXACT: 'Exact normalized domain',
    PHONE_EXACT: 'Exact normalized phone',
    STRONG_IDENTIFIERS_DISAGREE: 'Domain and phone point to different businesses',
    COMPOSITE_MATCH_REQUIRES_REVIEW: 'Name/location similarity is not strong enough to auto-merge',
    NO_EXISTING_IDENTITY_MATCH: 'No existing identity key matched',
    OPERATOR_CONFIRMED_DUPLICATE: 'Operator confirmed duplicate',
    OPERATOR_CONFIRMED_DISTINCT: 'Operator confirmed distinct business',
  };
  return labels[reason] ?? reason.replaceAll('_', ' ').toLowerCase();
}

export function ProspectsPage() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [identityNotice, setIdentityNotice] = useState<string | null>(null);

  const prospectsQuery = useQuery({
    queryKey: ['prospects'],
    queryFn: () => apiJson<{ prospects: Prospect[] }>('/api/v1/prospects'),
  });
  const prospects = useMemo(() => prospectsQuery.data?.prospects ?? [], [prospectsQuery.data]);

  useEffect(() => {
    if (!selectedId && prospects[0]) setSelectedId(prospects[0].id);
    if (
      selectedId &&
      prospects.length > 0 &&
      !prospects.some((item) => item.id === selectedId)
    ) {
      setSelectedId(prospects[0]?.id ?? null);
    }
  }, [prospects, selectedId]);

  const bundleQuery = useQuery({
    queryKey: ['prospect-evidence', selectedId],
    queryFn: () => apiJson<EvidenceBundle>(`/api/v1/prospects/${selectedId}/evidence-bundle`),
    enabled: Boolean(selectedId),
  });

  const identityQuery = useQuery({
    queryKey: ['prospect-identity', selectedId],
    queryFn: () => apiJson<IdentityBundle>(`/api/v1/prospects/${selectedId}/identity`),
    enabled: Boolean(selectedId),
  });

  const createProspect = useMutation({
    mutationFn: (payload: Record<string, string>) =>
      apiJson<CreateProspectResponse>('/api/v1/prospects', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: async ({ prospect, identity }) => {
      queryClient.setQueryData<{ prospects: Prospect[] }>(['prospects'], (current) => ({
        prospects: [
          prospect,
          ...(current?.prospects.filter((item) => item.id !== prospect.id) ?? []),
        ],
      }));
      setSelectedId(prospect.id);
      setShowForm(false);
      setFormError(null);
      if (identity?.deduplicated) {
        setIdentityNotice(
          `Existing canonical selected — ${identity.reasonCodes.map(humanReason).join(', ')}. No duplicate prospect was created.`,
        );
      } else if (identity?.status === 'REVIEW_REQUIRED' || identity?.status === 'CONFLICT') {
        setIdentityNotice('Identity review required before this business can enter research or outreach.');
      } else {
        setIdentityNotice('New canonical business identity verified.');
      }
      await queryClient.invalidateQueries({ queryKey: ['prospects'] });
      await queryClient.invalidateQueries({ queryKey: ['prospect-identity', prospect.id] });
    },
    onError: (error: Error) => setFormError(error.message),
  });

  const resolveIdentityMutation = useMutation({
    mutationFn: ({
      prospectId,
      payload,
    }: {
      prospectId: string;
      payload:
        | { type: 'LINK_TO_EXISTING'; canonicalProspectId: string }
        | { type: 'KEEP_DISTINCT' };
    }) =>
      apiJson<IdentityDecisionResponse>(`/api/v1/prospects/${prospectId}/identity/resolve`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: async (result) => {
      setIdentityNotice(
        result.decision === 'LINK_TO_EXISTING'
          ? `Duplicate retired. ${result.canonical.canonicalName} remains the canonical business.`
          : 'Business confirmed distinct and promoted to a canonical identity.',
      );
      setSelectedId(result.canonical.id);
      await queryClient.invalidateQueries({ queryKey: ['prospects'] });
      await queryClient.invalidateQueries({ queryKey: ['prospect-identity'] });
      await queryClient.invalidateQueries({ queryKey: ['prospect-evidence'] });
    },
    onError: (error: Error) => setIdentityNotice(error.message),
  });

  function submitProspect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const payload = Object.fromEntries(
      ['businessName', 'domain', 'phone', 'city', 'address']
        .map((key) => [key, formText(data, key)] as const)
        .filter(([, value]) => value.length > 0),
    );
    if (!payload.businessName) {
      setFormError('Business name is required.');
      return;
    }
    setIdentityNotice(null);
    createProspect.mutate(payload);
  }

  if (prospectsQuery.isPending) {
    return (
      <section className="prospects-state" aria-busy="true">
        <span>Loading prospect ledger…</span>
      </section>
    );
  }
  if (prospectsQuery.isError) {
    return (
      <section className="prospects-state" role="alert">
        <strong>Prospect ledger unavailable.</strong>
        <button type="button" onClick={() => void prospectsQuery.refetch()}>
          Retry
        </button>
      </section>
    );
  }

  return (
    <div className="prospects-page">
      <header className="prospects-heading">
        <div>
          <p className="eyebrow">PROSPECT + EVIDENCE CORE</p>
          <h2>One business. One identity.</h2>
          <p>
            Exact domain or phone matches deduplicate automatically. Similar names never silently
            merge; ambiguous identity stays parked for review.
          </p>
        </div>
        <button
          className="primary-button"
          type="button"
          onClick={() => setShowForm((open) => !open)}
        >
          {showForm ? 'Close entry' : 'Add prospect'}
        </button>
      </header>

      {identityNotice ? (
        <div className="identity-notice" role="status">
          <span>IDENTITY ENGINE</span>
          <p>{identityNotice}</p>
          <button type="button" onClick={() => setIdentityNotice(null)} aria-label="Dismiss identity notice">
            ×
          </button>
        </div>
      ) : null}

      {showForm ? (
        <form className="prospect-entry" onSubmit={submitProspect}>
          <label>
            Business name
            <input name="businessName" required placeholder="ÉLANE Salon & Spa" />
          </label>
          <label>
            Website
            <input name="domain" placeholder="example.com" />
          </label>
          <label>
            Phone
            <input name="phone" placeholder="+91 98765 43210" />
          </label>
          <label>
            City
            <input name="city" placeholder="Mumbai" />
          </label>
          <label className="entry-wide">
            Address
            <input name="address" placeholder="Verified public address, if known" />
          </label>
          <div className="entry-actions">
            {formError ? (
              <span role="alert">{formError}</span>
            ) : (
              <small>Blank optional fields stay blank. They are never inferred.</small>
            )}
            <button className="primary-button" disabled={createProspect.isPending} type="submit">
              {createProspect.isPending ? 'Resolving identity…' : 'Create or resolve'}
            </button>
          </div>
        </form>
      ) : null}

      {prospects.length === 0 ? (
        <section className="prospects-zero">
          <span>00</span>
          <h3>No prospects yet.</h3>
          <p>Add the first Salon & Spa business manually. Discovery automation comes later.</p>
        </section>
      ) : (
        <div className="prospect-workspace">
          <aside className="prospect-list" aria-label="Prospects">
            <div className="list-label">
              <span>{prospects.length} records</span>
              <small>latest first</small>
            </div>
            {prospects.map((prospect) => (
              <button
                className={`prospect-row ${selectedId === prospect.id ? 'active' : ''} ${prospect.currentState === 'DUPLICATE' ? 'is-duplicate' : ''}`}
                key={prospect.id}
                type="button"
                onClick={() => setSelectedId(prospect.id)}
              >
                <div>
                  <strong>{prospect.canonicalName}</strong>
                  <small>{prospect.city ?? 'City unverified'}</small>
                </div>
                <span>{prospect.currentState}</span>
              </button>
            ))}
          </aside>
          <section className="evidence-panel">
            {identityQuery.isPending ? <div className="identity-loading">Resolving identity trail…</div> : null}
            {identityQuery.isError ? (
              <div className="identity-loading" role="alert">
                Identity trail unavailable.
              </div>
            ) : null}
            {identityQuery.data ? (
              <IdentityPanel
                bundle={identityQuery.data}
                busy={resolveIdentityMutation.isPending}
                onKeepDistinct={() => {
                  if (!selectedId) return;
                  resolveIdentityMutation.mutate({
                    prospectId: selectedId,
                    payload: { type: 'KEEP_DISTINCT' },
                  });
                }}
                onLink={(canonicalProspectId) => {
                  if (!selectedId) return;
                  resolveIdentityMutation.mutate({
                    prospectId: selectedId,
                    payload: { type: 'LINK_TO_EXISTING', canonicalProspectId },
                  });
                }}
              />
            ) : null}

            {bundleQuery.isPending ? <div className="evidence-empty">Loading evidence…</div> : null}
            {bundleQuery.isError ? (
              <div className="evidence-empty" role="alert">
                Evidence bundle unavailable.
              </div>
            ) : null}
            {bundleQuery.data ? <EvidenceDetail bundle={bundleQuery.data} /> : null}
          </section>
        </div>
      )}
    </div>
  );
}

function IdentityPanel({
  bundle,
  busy,
  onLink,
  onKeepDistinct,
}: {
  bundle: IdentityBundle;
  busy: boolean;
  onLink: (canonicalProspectId: string) => void;
  onKeepDistinct: () => void;
}) {
  const { prospect } = bundle;
  const pending = prospect.currentState === 'IDENTITY_PENDING';
  const duplicate = prospect.currentState === 'DUPLICATE';
  const resolution = bundle.liveResolution;

  return (
    <section className={`identity-panel identity-${prospect.currentState.toLowerCase()}`} aria-label="Identity resolution">
      <div className="identity-panel-head">
        <div>
          <p className="eyebrow">IDENTITY RESOLUTION</p>
          <h3>{prospect.canonicalName}</h3>
        </div>
        <span className="identity-state">{prospect.currentState}</span>
      </div>

      {duplicate && bundle.alias ? (
        <div className="identity-alias">
          <strong>Retired duplicate</strong>
          <p>
            This record is permanently blocked from research and outreach. Canonical prospect:{' '}
            <code>{bundle.alias.canonicalProspectId}</code>
          </p>
        </div>
      ) : null}

      <div className="identity-metrics">
        <div>
          <span>Live verdict</span>
          <strong>{identityLabel(resolution.status)}</strong>
        </div>
        <div>
          <span>Confidence</span>
          <strong>{Math.round(resolution.confidence * 100)}%</strong>
        </div>
        <div>
          <span>Strong keys</span>
          <strong>{bundle.registeredKeys.filter((key) => key.keyStrength === 'STRONG').length}</strong>
        </div>
        <div>
          <span>Observations</span>
          <strong>{bundle.observations.length}</strong>
        </div>
      </div>

      {resolution.reasonCodes.length ? (
        <div className="identity-reasons">
          {resolution.reasonCodes.map((reason) => (
            <span key={reason}>{humanReason(reason)}</span>
          ))}
        </div>
      ) : null}

      {bundle.registeredKeys.length ? (
        <div className="identity-key-grid" aria-label="Registered identity keys">
          {bundle.registeredKeys.map((key) => (
            <article key={key.id}>
              <div>
                <small>{key.keyType}</small>
                <strong>{key.keyValue}</strong>
              </div>
              <span>{key.keyStrength}</span>
            </article>
          ))}
        </div>
      ) : null}

      {pending ? (
        <div className={`identity-review ${resolution.status === 'CONFLICT' ? 'is-conflict' : ''}`}>
          <div className="identity-review-copy">
            <strong>
              {resolution.status === 'CONFLICT'
                ? 'Strong identifiers disagree. Human decision required.'
                : 'Possible duplicate. Human decision required.'}
            </strong>
            <p>
              Weak similarity never merges automatically. Compare the candidates, then link this
              observation or explicitly keep it distinct.
            </p>
          </div>

          <div className="identity-candidates">
            {bundle.candidateProspects.map((candidate) => (
              <article className="identity-candidate" key={candidate.id}>
                <div>
                  <small>CANDIDATE CANONICAL</small>
                  <strong>{candidate.canonicalName}</strong>
                  <p>
                    {candidate.domain ?? 'No domain'} · {candidate.phoneNormalized ?? 'No phone'} ·{' '}
                    {candidate.city ?? 'No city'}
                  </p>
                </div>
                <button
                  className="identity-link-button"
                  type="button"
                  disabled={busy}
                  onClick={() => onLink(candidate.id)}
                >
                  Link as duplicate
                </button>
              </article>
            ))}
          </div>

          <button
            className="identity-distinct-button"
            type="button"
            disabled={busy || resolution.status === 'CONFLICT'}
            onClick={onKeepDistinct}
          >
            {resolution.status === 'CONFLICT'
              ? 'Keep distinct blocked by strong-key collision'
              : 'Keep as distinct business'}
          </button>
        </div>
      ) : null}

      {bundle.observations.length ? (
        <details className="identity-history">
          <summary>Identity audit trail · {bundle.observations.length}</summary>
          <div>
            {bundle.observations.slice(0, 8).map((observation) => (
              <article key={observation.id}>
                <span>{observation.resolutionStatus}</span>
                <strong>{observation.observedName}</strong>
                <small>
                  {observation.sourceType} · {Math.round(observation.confidence * 100)}%
                </small>
              </article>
            ))}
          </div>
        </details>
      ) : null}
    </section>
  );
}

function EvidenceDetail({ bundle }: { bundle: EvidenceBundle }) {
  const conflicts = bundle.conflicts.filter((item) => item.conflicted);
  const evidenceById = new Map(bundle.evidence.map((item) => [item.id, item]));
  return (
    <>
      <header className="evidence-header">
        <div>
          <p className="eyebrow">CANONICAL EVIDENCE</p>
          <h3>{bundle.prospect.canonicalName}</h3>
          <p>
            {bundle.prospect.domain ?? 'No verified domain'} ·{' '}
            {bundle.prospect.phoneNormalized ?? 'No verified phone'}
          </p>
        </div>
        <span className={`conflict-chip ${conflicts.length ? 'has-conflict' : ''}`}>
          {conflicts.length
            ? `${conflicts.length} conflict${conflicts.length > 1 ? 's' : ''}`
            : 'No conflicts'}
        </span>
      </header>
      {conflicts.length ? (
        <section className="conflict-box" aria-label="Evidence conflicts">
          <strong>Conflicting candidate values</strong>
          {conflicts.map((conflict) => (
            <div key={conflict.field}>
              <span>{conflict.field}</span>
              <p>{conflict.candidates.map((candidate) => candidate.value).join(' ↔ ')}</p>
            </div>
          ))}
        </section>
      ) : null}
      <section className="fact-section">
        <div className="evidence-section-title">
          <h4>Selected facts</h4>
          <span>{bundle.facts.length}</span>
        </div>
        {bundle.facts.length ? (
          bundle.facts.map((fact) => {
            const supporting = fact.evidenceId ? evidenceById.get(fact.evidenceId) : undefined;
            return (
              <article className="fact-row" key={fact.id}>
                <div>
                  <small>{fact.field}</small>
                  <strong>{fact.value}</strong>
                </div>
                <div className="fact-proof">
                  <StatusBadge status={fact.verificationStatus} />
                  <small>{Math.round(fact.confidence * 100)}% confidence</small>
                  {supporting ? (
                    <a href={supporting.sourceUrl} target="_blank" rel="noreferrer">
                      View source ↗
                    </a>
                  ) : null}
                </div>
              </article>
            );
          })
        ) : (
          <EmptyEvidence />
        )}
      </section>
      <section className="fact-section">
        <div className="evidence-section-title">
          <h4>Evidence candidates</h4>
          <span>{bundle.evidence.length}</span>
        </div>
        {bundle.evidence.length ? (
          bundle.evidence.map((item) => (
            <article className="evidence-row" key={item.id}>
              <div className="evidence-value">
                <small>{item.field}</small>
                <strong>{item.value}</strong>
                {item.excerpt ? <p>“{item.excerpt}”</p> : null}
              </div>
              <div className="evidence-meta">
                <StatusBadge status={item.verificationStatus} />
                <span>confidence {Math.round(item.confidence * 100)}%</span>
                <span>source quality {Math.round(item.sourceQuality * 100)}%</span>
                <a href={item.sourceUrl} target="_blank" rel="noreferrer">
                  Source ↗
                </a>
              </div>
            </article>
          ))
        ) : (
          <EmptyEvidence />
        )}
      </section>
      <section className="fact-section">
        <div className="evidence-section-title">
          <h4>Source provenance</h4>
          <span>{bundle.sources.length}</span>
        </div>
        {bundle.sources.length ? (
          bundle.sources.map((source) => (
            <article className="source-row" key={source.id}>
              <div>
                <strong>{source.sourceType}</strong>
                <small>{source.provider}</small>
              </div>
              <a href={source.sourceUrl} target="_blank" rel="noreferrer">
                {source.sourceUrl}
              </a>
            </article>
          ))
        ) : (
          <EmptyEvidence />
        )}
      </section>
    </>
  );
}
