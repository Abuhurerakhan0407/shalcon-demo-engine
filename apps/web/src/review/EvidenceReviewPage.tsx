import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';

import './evidence-review.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8787';

type VerificationStatus = 'VERIFIED' | 'PROBABLE' | 'CONFLICTED' | 'UNVERIFIED' | 'REJECTED';

interface Prospect {
  id: string;
  canonicalName: string;
  city: string | null;
  currentState: string;
}

interface EvidenceRecord {
  id: string;
  field: string;
  value: string;
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
  evidenceId: string | null;
}

interface ConflictSummary {
  field: string;
  conflicted: boolean;
}

interface EvidenceBundle {
  prospect: Prospect;
  evidence: EvidenceRecord[];
  facts: FactRecord[];
  conflicts: ConflictSummary[];
}

interface ReviewEvent {
  id: string;
  evidenceId: string;
  decision: 'VERIFY' | 'REJECT';
  fromStatus: 'PROBABLE' | 'UNVERIFIED';
  toStatus: 'VERIFIED' | 'REJECTED';
  promotedToFact: boolean;
  note: string | null;
  createdAt: string;
}

interface ReviewResponse {
  evidence: EvidenceRecord;
  fact: FactRecord | null;
  event: ReviewEvent;
}

interface AuditorPreview {
  prospectCount: number;
  safeActionCount: number;
  autoRejectCount: number;
  autoVerifyCount: number;
  humanRequiredCount: number;
}

interface AuditorApplyResult extends AuditorPreview {
  appliedCount: number;
  skippedCount: number;
}

async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(payload?.error?.message ?? `Request failed with ${response.status}.`);
  }
  return response.json() as Promise<T>;
}

function normalizedField(field: string): string {
  return field.trim().toLowerCase().replace(/[^a-z0-9]/gu, '');
}

const MULTI_VALUE_FIELDS = new Set(['service', 'services', 'openinghours', 'sociallink', 'sociallinks']);

export function EvidenceReviewPage() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [activeEvidenceId, setActiveEvidenceId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const prospectsQuery = useQuery({
    queryKey: ['prospects'],
    queryFn: () => apiJson<{ prospects: Prospect[] }>('/api/v1/prospects'),
  });
  const prospects = useMemo(() => prospectsQuery.data?.prospects ?? [], [prospectsQuery.data]);

  useEffect(() => {
    if (!selectedId && prospects[0]) setSelectedId(prospects[0].id);
    if (selectedId && prospects.length && !prospects.some((item) => item.id === selectedId)) {
      setSelectedId(prospects[0]?.id ?? null);
    }
  }, [prospects, selectedId]);

  const bundleQuery = useQuery({
    queryKey: ['evidence-review-bundle', selectedId],
    queryFn: () => apiJson<EvidenceBundle>(`/api/v1/prospects/${selectedId}/evidence-bundle`),
    enabled: Boolean(selectedId),
  });
  const reviewsQuery = useQuery({
    queryKey: ['evidence-review-events', selectedId],
    queryFn: () => apiJson<{ events: ReviewEvent[] }>(`/api/v1/prospects/${selectedId}/evidence/reviews`),
    enabled: Boolean(selectedId),
  });
  const auditorPreviewQuery = useQuery({
    queryKey: ['evidence-auditor-preview'],
    queryFn: () => apiJson<AuditorPreview>('/api/v1/evidence-auditor/preview'),
  });

  const auditorMutation = useMutation({
    mutationFn: () =>
      apiJson<AuditorApplyResult>('/api/v1/evidence-auditor/apply-safe', {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    onMutate: () => setNotice(null),
    onSuccess: async (result) => {
      setNotice(
        `AI auditor applied ${result.appliedCount} safe decisions. ${result.humanRequiredCount} evidence exceptions still need judgment.`,
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['prospects'] }),
        queryClient.invalidateQueries({ queryKey: ['evidence-review-bundle'] }),
        queryClient.invalidateQueries({ queryKey: ['evidence-review-events'] }),
        queryClient.invalidateQueries({ queryKey: ['prospect-evidence'] }),
        queryClient.invalidateQueries({ queryKey: ['evidence-auditor-preview'] }),
      ]);
    },
    onError: (error: Error) => setNotice(error.message),
  });

  const reviewMutation = useMutation({
    mutationFn: ({
      prospectId,
      evidenceId,
      decision,
      promoteToFact,
      note,
    }: {
      prospectId: string;
      evidenceId: string;
      decision: 'VERIFY' | 'REJECT';
      promoteToFact?: boolean;
      note?: string;
    }) => {
      const trimmedNote = note?.trim();
      return apiJson<ReviewResponse>(`/api/v1/prospects/${prospectId}/evidence/${evidenceId}/review`, {
        method: 'POST',
        body: JSON.stringify(
          decision === 'VERIFY'
            ? { decision, promoteToFact: promoteToFact === true, note: trimmedNote || undefined }
            : { decision, note: trimmedNote || undefined },
        ),
      });
    },
    onMutate: ({ evidenceId }) => {
      setActiveEvidenceId(evidenceId);
      setNotice(null);
    },
    onSuccess: async (result, variables) => {
      setNotice(
        result.event.decision === 'VERIFY'
          ? result.event.promotedToFact
            ? 'Evidence verified and selected as the canonical fact.'
            : 'Evidence verified. No canonical fact was replaced.'
          : 'Evidence rejected and excluded from verified content.',
      );
      setNotes((current) => {
        const next = { ...current };
        delete next[variables.evidenceId];
        return next;
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['evidence-review-bundle', variables.prospectId] }),
        queryClient.invalidateQueries({ queryKey: ['evidence-review-events', variables.prospectId] }),
        queryClient.invalidateQueries({ queryKey: ['prospect-evidence', variables.prospectId] }),
      ]);
    },
    onError: (error: Error) => setNotice(error.message),
    onSettled: () => setActiveEvidenceId(null),
  });

  const bundle = bundleQuery.data;
  const conflicts = new Set(
    (bundle?.conflicts ?? []).filter((item) => item.conflicted).map((item) => item.field),
  );
  const pending = (bundle?.evidence ?? []).filter(
    (item) => item.verificationStatus === 'PROBABLE' || item.verificationStatus === 'UNVERIFIED',
  );

  return (
    <div className="review-page">
      <header className="review-hero">
        <div>
          <p className="eyebrow">AI + HUMAN EVIDENCE GATE</p>
          <h2>AI clears safe evidence. You inspect exceptions.</h2>
          <p>
            Locked identity, corroborated sources, and contamination rules handle routine evidence automatically.
            Ambiguous critical facts stay blocked for human judgment, with every decision preserved in the review trail.
          </p>
        </div>
        <div className="review-hero-metric">
          <span>Decisions left</span>
          <strong>{pending.length}</strong>
          <small>{bundle?.prospect.currentState ?? 'Select a prospect'}</small>
        </div>
      </header>

      <section className="review-auditor" aria-label="AI evidence auditor">
        <div>
          <span>SAFE AI AUDITOR</span>
          <strong>
            {auditorPreviewQuery.isPending
              ? 'Checking evidence safety…'
              : `${auditorPreviewQuery.data?.safeActionCount ?? 0} automatic decisions ready · ${auditorPreviewQuery.data?.humanRequiredCount ?? 0} exceptions`}
          </strong>
          <small>
            Auto-verify requires locked-identity or multi-source corroboration. Critical contradictions never get guessed.
          </small>
        </div>
        <button
          type="button"
          disabled={auditorMutation.isPending || (auditorPreviewQuery.data?.safeActionCount ?? 0) === 0}
          onClick={() => auditorMutation.mutate()}
        >
          {auditorMutation.isPending ? 'Auditing…' : 'Run safe AI audit'}
        </button>
      </section>

      {notice ? <div className="review-notice" role="status">{notice}</div> : null}

      <div className="review-workspace">
        <aside className="review-prospects" aria-label="Prospects awaiting evidence review">
          <div className="review-list-head">{prospects.length} prospects</div>
          {prospects.map((prospect) => (
            <button
              key={prospect.id}
              type="button"
              className={selectedId === prospect.id ? 'active' : ''}
              onClick={() => {
                setSelectedId(prospect.id);
                setNotice(null);
              }}
            >
              <strong>{prospect.canonicalName}</strong>
              <small>{prospect.city ?? 'Mumbai'} · {prospect.currentState}</small>
            </button>
          ))}
        </aside>

        <main className="review-evidence">
          {prospectsQuery.isPending || bundleQuery.isPending ? (
            <div className="review-empty">Loading evidence ledger…</div>
          ) : null}
          {prospectsQuery.isError || bundleQuery.isError ? (
            <div className="review-empty" role="alert">Evidence review data is unavailable.</div>
          ) : null}
          {bundle ? (
            <>
              <div className="review-title-row">
                <div>
                  <p className="eyebrow">{bundle.prospect.currentState}</p>
                  <h3>{bundle.prospect.canonicalName}</h3>
                </div>
                <span>{pending.length} decisions left</span>
              </div>

              {pending.length ? (
                <div className="review-cards">
                  {pending.map((item) => {
                    const hasConflict = conflicts.has(item.field);
                    const multiValue = MULTI_VALUE_FIELDS.has(normalizedField(item.field));
                    const busy = reviewMutation.isPending && activeEvidenceId === item.id;
                    const note = notes[item.id] ?? '';
                    return (
                      <article className={`review-card ${hasConflict ? 'has-conflict' : ''}`} key={item.id}>
                        <div className="review-card-head">
                          <div>
                            <small>{item.field}</small>
                            <strong>{item.value}</strong>
                          </div>
                          <span>{item.verificationStatus}</span>
                        </div>
                        {item.excerpt ? <blockquote>{item.excerpt}</blockquote> : null}
                        <div className="review-proof">
                          <span>Confidence {Math.round(item.confidence * 100)}%</span>
                          <span>Source quality {Math.round(item.sourceQuality * 100)}%</span>
                          <a href={item.sourceUrl} target="_blank" rel="noreferrer">Open source ↗</a>
                        </div>
                        {hasConflict ? (
                          <p className="review-warning">Conflicting values exist for this field. Resolve/reject the conflict before verification.</p>
                        ) : null}
                        <label className="review-note">
                          <span>Review note <small>optional</small></span>
                          <textarea
                            value={note}
                            maxLength={500}
                            rows={2}
                            placeholder="What did you confirm or reject?"
                            onChange={(event) => setNotes((current) => ({ ...current, [item.id]: event.target.value }))}
                          />
                        </label>
                        <div className="review-actions">
                          <button
                            type="button"
                            disabled={busy || hasConflict}
                            onClick={() => reviewMutation.mutate({ prospectId: bundle.prospect.id, evidenceId: item.id, decision: 'VERIFY', note })}
                          >
                            Verify evidence
                          </button>
                          {!multiValue ? (
                            <button
                              className="primary-review"
                              type="button"
                              disabled={busy || hasConflict}
                              onClick={() => reviewMutation.mutate({ prospectId: bundle.prospect.id, evidenceId: item.id, decision: 'VERIFY', promoteToFact: true, note })}
                            >
                              Verify + use as fact
                            </button>
                          ) : null}
                          <button
                            className="reject-review"
                            type="button"
                            disabled={busy}
                            onClick={() => reviewMutation.mutate({ prospectId: bundle.prospect.id, evidenceId: item.id, decision: 'REJECT', note })}
                          >
                            Reject
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="review-empty"><strong>No unresolved AI evidence.</strong><span>This prospect has no PROBABLE or UNVERIFIED candidates waiting for review.</span></div>
              )}

              <section className="review-history">
                <div className="review-section-head">
                  <h4>Review trail</h4>
                  <span>{reviewsQuery.data?.events.length ?? 0}</span>
                </div>
                {(reviewsQuery.data?.events ?? []).map((event) => (
                  <div className="review-history-row" key={event.id}>
                    <span>{event.decision}</span>
                    <code>{event.evidenceId}</code>
                    <small>{event.fromStatus} → {event.toStatus}{event.promotedToFact ? ' · canonical fact' : ''}{event.note ? ` · ${event.note}` : ''}</small>
                  </div>
                ))}
              </section>
            </>
          ) : null}
        </main>
      </div>
    </div>
  );
}
