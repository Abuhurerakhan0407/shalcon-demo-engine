import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';

import './research.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8787';

type VerificationStatus = 'VERIFIED' | 'PROBABLE' | 'CONFLICTED' | 'UNVERIFIED' | 'REJECTED';

interface Prospect {
  id: string;
  canonicalName: string;
  currentState: string;
  domain: string | null;
  city: string | null;
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
  facts: Array<{ id: string; field: string; value: string; verificationStatus: VerificationStatus }>;
  conflicts: ConflictSummary[];
}

async function apiJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, { credentials: 'include' });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(payload?.error?.message ?? `Request failed with ${response.status}.`);
  }
  return response.json() as Promise<T>;
}

function confidenceLabel(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function stateLabel(state: string): string {
  return state.replaceAll('_', ' ').toLowerCase();
}

export function ResearchPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const prospectsQuery = useQuery({
    queryKey: ['prospects'],
    queryFn: () => apiJson<{ prospects: Prospect[] }>('/api/v1/prospects'),
  });
  const prospects = useMemo(() => prospectsQuery.data?.prospects ?? [], [prospectsQuery.data]);

  useEffect(() => {
    if (!selectedId && prospects[0]) setSelectedId(prospects[0].id);
    if (selectedId && prospects.length > 0 && !prospects.some((item) => item.id === selectedId)) {
      setSelectedId(prospects[0]?.id ?? null);
    }
  }, [prospects, selectedId]);

  const bundleQuery = useQuery({
    queryKey: ['prospect-evidence', selectedId],
    queryFn: () => apiJson<EvidenceBundle>(`/api/v1/prospects/${selectedId}/evidence-bundle`),
    enabled: Boolean(selectedId),
    refetchInterval: 5000,
  });

  if (prospectsQuery.isPending) {
    return <section className="research-state" aria-busy="true">Loading research ledger…</section>;
  }
  if (prospectsQuery.isError) {
    return <section className="research-state" role="alert">Research ledger unavailable.</section>;
  }

  const bundle = bundleQuery.data;
  const conflictFields = bundle?.conflicts.filter((item) => item.conflicted) ?? [];
  const sourceById = new Map(bundle?.sources.map((source) => [source.id, source]) ?? []);

  return (
    <div className="research-page">
      <header className="research-hero">
        <div>
          <p className="eyebrow">AUTOMATED RESEARCH + EVIDENCE</p>
          <h2>Evidence before claims.</h2>
          <p>
            Browser captures feed local AI extraction. Every candidate stays source-linked, and AI
            never silently promotes itself into a verified canonical fact.
          </p>
        </div>
        <div className="research-guardrails" aria-label="Research guardrails">
          <span>Max 6 pages</span>
          <span>No auto-verify</span>
          <span>Conflict stop</span>
        </div>
      </header>

      {prospects.length === 0 ? (
        <section className="research-state">
          <strong>No prospects available.</strong>
          <p>Add a Salon &amp; Spa prospect before running research.</p>
        </section>
      ) : (
        <div className="research-workspace">
          <aside className="research-prospects" aria-label="Research prospects">
            <div className="research-list-head">
              <span>{prospects.length} prospects</span>
              <small>source ledger</small>
            </div>
            {prospects.map((prospect) => (
              <button
                type="button"
                key={prospect.id}
                className={selectedId === prospect.id ? 'active' : ''}
                onClick={() => setSelectedId(prospect.id)}
              >
                <div>
                  <strong>{prospect.canonicalName}</strong>
                  <small>{prospect.domain ?? prospect.city ?? 'Identity data sparse'}</small>
                </div>
                <span>{stateLabel(prospect.currentState)}</span>
              </button>
            ))}
          </aside>

          <section className="research-detail">
            {bundleQuery.isPending ? <div className="research-state">Loading source evidence…</div> : null}
            {bundleQuery.isError ? <div className="research-state" role="alert">Evidence bundle unavailable.</div> : null}
            {bundle ? (
              <>
                <div className="research-summary">
                  <div>
                    <p className="eyebrow">RESEARCH STATUS</p>
                    <h3>{bundle.prospect.canonicalName}</h3>
                    <p>{stateLabel(bundle.prospect.currentState)}</p>
                  </div>
                  <div className="research-metrics">
                    <article><span>Sources</span><strong>{bundle.sources.length}</strong></article>
                    <article><span>Candidates</span><strong>{bundle.evidence.length}</strong></article>
                    <article><span>Canonical facts</span><strong>{bundle.facts.length}</strong></article>
                    <article className={conflictFields.length ? 'warning' : ''}><span>Conflicts</span><strong>{conflictFields.length}</strong></article>
                  </div>
                </div>

                {conflictFields.length ? (
                  <section className="research-conflicts" aria-label="Research conflicts">
                    <div>
                      <strong>Conflicting candidate evidence</strong>
                      <p>Critical disagreement must be resolved before the prospect can move forward.</p>
                    </div>
                    {conflictFields.map((conflict) => (
                      <article key={conflict.field}>
                        <span>{conflict.field}</span>
                        <strong>{conflict.candidates.length} competing values</strong>
                      </article>
                    ))}
                  </section>
                ) : null}

                <section className="research-candidates" aria-label="Extracted evidence candidates">
                  <div className="research-section-head">
                    <div><p className="eyebrow">CANDIDATE FACTS</p><h3>Source-linked extraction</h3></div>
                    <small>Probability is not verification.</small>
                  </div>
                  {bundle.evidence.length === 0 ? (
                    <div className="research-empty">No extracted candidates yet.</div>
                  ) : (
                    bundle.evidence.map((item) => {
                      const source = sourceById.get(item.sourceRecordId);
                      return (
                        <article className="research-candidate" key={item.id}>
                          <div className="research-candidate-main">
                            <div>
                              <span>{item.field}</span>
                              <strong>{item.value}</strong>
                            </div>
                            <div className="research-confidence">
                              <strong>{confidenceLabel(item.confidence)}</strong>
                              <span>{item.verificationStatus}</span>
                            </div>
                          </div>
                          {item.excerpt ? <p>{item.excerpt}</p> : null}
                          <footer>
                            <a href={item.sourceUrl} target="_blank" rel="noreferrer">Open evidence source</a>
                            <span>{source?.provider ?? 'SOURCE'} · {source?.sourceType ?? 'EVIDENCE'}</span>
                          </footer>
                        </article>
                      );
                    })
                  )}
                </section>

                <section className="research-sources" aria-label="Captured research sources">
                  <div className="research-section-head">
                    <div><p className="eyebrow">SOURCE PROVENANCE</p><h3>Immutable captures</h3></div>
                    <small>{bundle.sources.length} stored</small>
                  </div>
                  <div>
                    {bundle.sources.map((source, index) => (
                      <article key={source.id}>
                        <span>{String(index + 1).padStart(2, '0')}</span>
                        <div><strong>{source.sourceType}</strong><a href={source.sourceUrl} target="_blank" rel="noreferrer">{source.sourceUrl}</a></div>
                        <small>{source.provider}</small>
                      </article>
                    ))}
                  </div>
                </section>
              </>
            ) : null}
          </section>
        </div>
      )}
    </div>
  );
}
