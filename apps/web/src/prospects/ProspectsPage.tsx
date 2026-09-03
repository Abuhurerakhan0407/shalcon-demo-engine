import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState, type FormEvent } from 'react';

import './prospects.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8787';

type VerificationStatus = 'VERIFIED' | 'PROBABLE' | 'CONFLICTED' | 'UNVERIFIED' | 'REJECTED';

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
interface SourceRecord { id: string; provider: string; sourceType: string; sourceUrl: string; capturedAt: string }
interface EvidenceRecord { id: string; field: string; value: string; sourceRecordId: string; sourceUrl: string; sourceQuality: number; confidence: number; verificationStatus: VerificationStatus; excerpt: string | null }
interface FactRecord { id: string; field: string; value: string; verificationStatus: VerificationStatus; confidence: number; evidenceId: string | null }
interface ConflictSummary { field: string; conflicted: boolean; candidates: Array<{ value: string; evidenceIds: string[]; bestConfidence: number; bestSourceQuality: number }> }
interface EvidenceBundle { prospect: Prospect; sources: SourceRecord[]; evidence: EvidenceRecord[]; facts: FactRecord[]; conflicts: ConflictSummary[] }

async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, { ...init, credentials: 'include', headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(payload?.error?.message ?? `Request failed with ${response.status}.`);
  }
  return response.json() as Promise<T>;
}

function StatusBadge({ status }: { status: VerificationStatus }) {
  return <span className={`evidence-status status-${status.toLowerCase()}`}>{status}</span>;
}
function EmptyEvidence() {
  return <div className="evidence-empty"><strong>No evidence captured yet.</strong><p>Research sources will appear here with confidence and provenance. Nothing is treated as fact by default.</p></div>;
}
function formText(data: FormData, key: string): string {
  const value = data.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

export function ProspectsPage() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const prospectsQuery = useQuery({ queryKey: ['prospects'], queryFn: () => apiJson<{ prospects: Prospect[] }>('/api/v1/prospects') });
  const prospects = useMemo(() => prospectsQuery.data?.prospects ?? [], [prospectsQuery.data]);
  useEffect(() => {
    if (!selectedId && prospects[0]) setSelectedId(prospects[0].id);
    if (selectedId && prospects.length > 0 && !prospects.some((item) => item.id === selectedId)) setSelectedId(prospects[0]?.id ?? null);
  }, [prospects, selectedId]);

  const bundleQuery = useQuery({ queryKey: ['prospect-evidence', selectedId], queryFn: () => apiJson<EvidenceBundle>(`/api/v1/prospects/${selectedId}/evidence-bundle`), enabled: Boolean(selectedId) });
  const createProspect = useMutation({
    mutationFn: (payload: Record<string, string>) => apiJson<{ prospect: Prospect }>('/api/v1/prospects', { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: async ({ prospect }) => { setSelectedId(prospect.id); setShowForm(false); setFormError(null); await queryClient.invalidateQueries({ queryKey: ['prospects'] }); },
    onError: (error: Error) => setFormError(error.message),
  });

  function submitProspect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const payload = Object.fromEntries(
      ['businessName', 'domain', 'phone', 'city', 'address']
        .map((key) => [key, formText(data, key)] as const)
        .filter(([, value]) => value.length > 0),
    );
    if (!payload.businessName) { setFormError('Business name is required.'); return; }
    createProspect.mutate(payload);
  }

  if (prospectsQuery.isPending) return <section className="prospects-state" aria-busy="true"><span>Loading prospect ledger…</span></section>;
  if (prospectsQuery.isError) return <section className="prospects-state" role="alert"><strong>Prospect ledger unavailable.</strong><button type="button" onClick={() => void prospectsQuery.refetch()}>Retry</button></section>;

  return <div className="prospects-page">
    <header className="prospects-heading"><div><p className="eyebrow">PROSPECT + EVIDENCE CORE</p><h2>Facts earn their way in.</h2><p>Manual prospects are allowed. Verified claims are not—until evidence supports them.</p></div><button className="primary-button" type="button" onClick={() => setShowForm((open) => !open)}>{showForm ? 'Close entry' : 'Add prospect'}</button></header>
    {showForm ? <form className="prospect-entry" onSubmit={submitProspect}><label>Business name<input name="businessName" required placeholder="ÉLANE Salon & Spa" /></label><label>Website<input name="domain" placeholder="example.com" /></label><label>Phone<input name="phone" placeholder="+91 98765 43210" /></label><label>City<input name="city" placeholder="Mumbai" /></label><label className="entry-wide">Address<input name="address" placeholder="Verified public address, if known" /></label><div className="entry-actions">{formError ? <span role="alert">{formError}</span> : <small>Blank optional fields stay blank. They are never inferred.</small>}<button className="primary-button" disabled={createProspect.isPending} type="submit">{createProspect.isPending ? 'Saving…' : 'Create prospect'}</button></div></form> : null}
    {prospects.length === 0 ? <section className="prospects-zero"><span>00</span><h3>No prospects yet.</h3><p>Add the first Salon & Spa business manually. Discovery automation comes later.</p></section> : <div className="prospect-workspace"><aside className="prospect-list" aria-label="Prospects"><div className="list-label"><span>{prospects.length} records</span><small>latest first</small></div>{prospects.map((prospect) => <button className={`prospect-row ${selectedId === prospect.id ? 'active' : ''}`} key={prospect.id} type="button" onClick={() => setSelectedId(prospect.id)}><div><strong>{prospect.canonicalName}</strong><small>{prospect.city ?? 'City unverified'}</small></div><span>{prospect.currentState}</span></button>)}</aside><section className="evidence-panel">{bundleQuery.isPending ? <div className="evidence-empty">Loading evidence…</div> : null}{bundleQuery.isError ? <div className="evidence-empty" role="alert">Evidence bundle unavailable.</div> : null}{bundleQuery.data ? <EvidenceDetail bundle={bundleQuery.data} /> : null}</section></div>}
  </div>;
}

function EvidenceDetail({ bundle }: { bundle: EvidenceBundle }) {
  const conflicts = bundle.conflicts.filter((item) => item.conflicted);
  const evidenceById = new Map(bundle.evidence.map((item) => [item.id, item]));
  return <>
    <header className="evidence-header"><div><p className="eyebrow">CANONICAL PROSPECT</p><h3>{bundle.prospect.canonicalName}</h3><p>{bundle.prospect.domain ?? 'No verified domain'} · {bundle.prospect.phoneNormalized ?? 'No verified phone'}</p></div><span className={`conflict-chip ${conflicts.length ? 'has-conflict' : ''}`}>{conflicts.length ? `${conflicts.length} conflict${conflicts.length > 1 ? 's' : ''}` : 'No conflicts'}</span></header>
    {conflicts.length ? <section className="conflict-box" aria-label="Evidence conflicts"><strong>Conflicting candidate values</strong>{conflicts.map((conflict) => <div key={conflict.field}><span>{conflict.field}</span><p>{conflict.candidates.map((candidate) => candidate.value).join(' ↔ ')}</p></div>)}</section> : null}
    <section className="fact-section"><div className="evidence-section-title"><h4>Selected facts</h4><span>{bundle.facts.length}</span></div>{bundle.facts.length ? bundle.facts.map((fact) => { const supporting = fact.evidenceId ? evidenceById.get(fact.evidenceId) : undefined; return <article className="fact-row" key={fact.id}><div><small>{fact.field}</small><strong>{fact.value}</strong></div><div className="fact-proof"><StatusBadge status={fact.verificationStatus} /><small>{Math.round(fact.confidence * 100)}% confidence</small>{supporting ? <a href={supporting.sourceUrl} target="_blank" rel="noreferrer">View source ↗</a> : null}</div></article>; }) : <EmptyEvidence />}</section>
    <section className="fact-section"><div className="evidence-section-title"><h4>Evidence candidates</h4><span>{bundle.evidence.length}</span></div>{bundle.evidence.length ? bundle.evidence.map((item) => <article className="evidence-row" key={item.id}><div className="evidence-value"><small>{item.field}</small><strong>{item.value}</strong>{item.excerpt ? <p>“{item.excerpt}”</p> : null}</div><div className="evidence-meta"><StatusBadge status={item.verificationStatus} /><span>confidence {Math.round(item.confidence * 100)}%</span><span>source quality {Math.round(item.sourceQuality * 100)}%</span><a href={item.sourceUrl} target="_blank" rel="noreferrer">Source ↗</a></div></article>) : <EmptyEvidence />}</section>
    <section className="fact-section"><div className="evidence-section-title"><h4>Source provenance</h4><span>{bundle.sources.length}</span></div>{bundle.sources.length ? bundle.sources.map((source) => <article className="source-row" key={source.id}><div><strong>{source.sourceType}</strong><small>{source.provider}</small></div><a href={source.sourceUrl} target="_blank" rel="noreferrer">{source.sourceUrl}</a></article>) : <EmptyEvidence />}</section>
  </>;
}
