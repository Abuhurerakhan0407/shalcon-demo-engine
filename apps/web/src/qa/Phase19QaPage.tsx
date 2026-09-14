import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';

import './phase19-qa.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8787';

interface Prospect {
  id: string;
  canonicalName: string;
  currentState: string;
}

interface AutomatedBuild {
  id: string;
  demoId: string;
  createdAt: string;
}

interface QaIssue {
  id: string;
  qaRunId: string;
  demoId: string;
  qaType: 'FACT_PHASE19' | 'SALES_PHASE19';
  code: string;
  field: string | null;
  severity: 'BLOCKING' | 'REVIEW';
  message: string;
  evidenceIds: string[];
  status: 'OPEN' | 'RESOLVED' | 'WAIVED';
  createdAt: string;
  resolvedAt: string | null;
  resolvedByUserId: string | null;
  resolutionNote: string | null;
}

interface Fact {
  id: string;
  field: string;
  value: string;
  verificationStatus: string;
  confidence: number;
  evidenceId: string | null;
}

interface Evidence {
  id: string;
  field: string;
  value: string;
  sourceUrl: string;
  sourceQuality: number;
  confidence: number;
  verificationStatus: string;
  capturedAt: string;
}

interface EvidenceInspection {
  demo: {
    id: string;
    prospectId: string;
    factQaStatus: string;
    salesQaStatus: string;
  };
  prospect: {
    id: string;
    canonicalName: string;
    currentState: string;
  };
  facts: Fact[];
  evidence: Evidence[];
  factQa: {
    id: string;
    status: string;
    checks: Record<string, unknown>;
    issues: QaIssue[];
  } | null;
}

interface SalesChecklist {
  previewReviewed: boolean;
  factsReviewed: boolean;
  ctaReviewed: boolean;
  screenshotsReviewed: boolean;
  disclosureReviewed: boolean;
}

type ResolutionAction = 'RESOLVED' | 'WAIVED';

const EMPTY_CHECKLIST: SalesChecklist = {
  previewReviewed: false,
  factsReviewed: false,
  ctaReviewed: false,
  screenshotsReviewed: false,
  disclosureReviewed: false,
};

const QA_STATES = new Set(['FACT_QA_PENDING', 'SALES_QA_PENDING', 'QA_FAILED', 'DEMO_READY']);

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

function stateLabel(value: string) {
  return value.replaceAll('_', ' ');
}

function confidence(value: number) {
  return `${Math.round(value * 100)}%`;
}

export function Phase19QaPage() {
  const queryClient = useQueryClient();
  const [selectedProspectId, setSelectedProspectId] = useState<string | null>(null);
  const [selectedDemoId, setSelectedDemoId] = useState<string | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState<Record<string, string>>({});
  const [checklist, setChecklist] = useState<SalesChecklist>(EMPTY_CHECKLIST);
  const [salesNote, setSalesNote] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  const prospectsQuery = useQuery({
    queryKey: ['prospects'],
    queryFn: () => apiJson<{ prospects: Prospect[] }>('/api/v1/prospects'),
  });
  const reviewQueueQuery = useQuery({
    queryKey: ['phase19-review-queue'],
    queryFn: () =>
      apiJson<{ issues: QaIssue[] }>('/api/v1/automated-demo/phase19/review-queue'),
  });

  const qaProspects = useMemo(
    () => (prospectsQuery.data?.prospects ?? []).filter((prospect) => QA_STATES.has(prospect.currentState)),
    [prospectsQuery.data],
  );

  useEffect(() => {
    if (!selectedProspectId && qaProspects[0]) setSelectedProspectId(qaProspects[0].id);
    if (selectedProspectId && !qaProspects.some((item) => item.id === selectedProspectId)) {
      setSelectedProspectId(qaProspects[0]?.id ?? null);
    }
  }, [qaProspects, selectedProspectId]);

  const buildsQuery = useQuery({
    queryKey: ['phase19-builds', selectedProspectId],
    queryFn: () =>
      apiJson<{ builds: AutomatedBuild[] }>(
        `/api/v1/automated-demo/prospects/${selectedProspectId}/builds`,
      ),
    enabled: Boolean(selectedProspectId),
  });

  useEffect(() => {
    if (!selectedProspectId || !buildsQuery.data) return;
    setSelectedDemoId(buildsQuery.data.builds[0]?.demoId ?? null);
  }, [selectedProspectId, buildsQuery.data]);

  const inspectionQuery = useQuery({
    queryKey: ['phase19-evidence', selectedDemoId],
    queryFn: () =>
      apiJson<EvidenceInspection>(
        `/api/v1/automated-demo/phase19/demos/${selectedDemoId}/evidence`,
      ),
    enabled: Boolean(selectedDemoId),
  });

  const refreshQa = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['prospects'] }),
      queryClient.invalidateQueries({ queryKey: ['phase19-review-queue'] }),
      queryClient.invalidateQueries({ queryKey: ['phase19-evidence', selectedDemoId] }),
      queryClient.invalidateQueries({ queryKey: ['phase19-builds', selectedProspectId] }),
    ]);
  };

  const runFactQa = useMutation({
    mutationFn: () =>
      apiJson<{ result: { status: string; nextState: string } }>(
        `/api/v1/automated-demo/phase19/demos/${selectedDemoId}/fact-qa/run`,
        { method: 'POST' },
      ),
    onSuccess: async ({ result }) => {
      setNotice(`Fact QA ${result.status}. Next state: ${stateLabel(result.nextState)}.`);
      await refreshQa();
    },
    onError: (error: Error) => setNotice(error.message),
  });

  const resolveIssue = useMutation({
    mutationFn: ({ issueId, action }: { issueId: string; action: ResolutionAction }) =>
      apiJson<{ issue: QaIssue }>(
        `/api/v1/automated-demo/phase19/issues/${issueId}/resolve`,
        {
          method: 'POST',
          body: JSON.stringify({ action, note: resolutionNotes[issueId] ?? '' }),
        },
      ),
    onSuccess: async ({ issue }) => {
      setNotice(`${issue.code} marked ${issue.status.toLowerCase()}. Re-run Fact QA after correcting evidence when required.`);
      setResolutionNotes((current) => ({ ...current, [issue.id]: '' }));
      await refreshQa();
    },
    onError: (error: Error) => setNotice(error.message),
  });

  const salesQa = useMutation({
    mutationFn: (decision: 'APPROVED' | 'REJECTED') =>
      apiJson<{ result: { decision: string; nextState: string; demoStatus: string } }>(
        `/api/v1/automated-demo/phase19/demos/${selectedDemoId}/sales-qa`,
        {
          method: 'POST',
          body: JSON.stringify({
            decision,
            checklist,
            note: salesNote.trim() || null,
          }),
        },
      ),
    onSuccess: async ({ result }) => {
      setNotice(`Sales QA ${result.decision}. Demo: ${result.demoStatus}; prospect: ${stateLabel(result.nextState)}.`);
      setChecklist(EMPTY_CHECKLIST);
      setSalesNote('');
      await refreshQa();
    },
    onError: (error: Error) => setNotice(error.message),
  });

  const inspection = inspectionQuery.data;
  const openIssues = reviewQueueQuery.data?.issues ?? [];
  const selectedState = inspection?.prospect.currentState ??
    qaProspects.find((prospect) => prospect.id === selectedProspectId)?.currentState ?? '';
  const allChecklistConfirmed = Object.values(checklist).every(Boolean);
  const busy = runFactQa.isPending || resolveIssue.isPending || salesQa.isPending;

  const evidenceById = useMemo(
    () => new Map((inspection?.evidence ?? []).map((item) => [item.id, item])),
    [inspection?.evidence],
  );

  function chooseIssue(issue: QaIssue) {
    const owner = qaProspects.find((prospect) => prospect.id === inspection?.prospect.id);
    if (owner) setSelectedProspectId(owner.id);
    setSelectedDemoId(issue.demoId);
    setNotice(null);
  }

  return (
    <div className="phase19-page">
      <header className="phase19-heading">
        <div>
          <p className="eyebrow">PHASE 19 / FACT + SALES QA</p>
          <h2>Nothing becomes ready on vibes.</h2>
          <p>
            Inspect the source behind every visible critical fact, resolve evidence issues, then make the human sales decision.
          </p>
        </div>
        <div className="phase19-gate"><strong>HUMAN GATE</strong><span>Sending remains disabled</span></div>
      </header>

      {notice ? <div className="phase19-notice" role="status"><span>{notice}</span><button type="button" onClick={() => setNotice(null)}>×</button></div> : null}

      <section className="phase19-metrics" aria-label="Phase 19 queue summary">
        <article><span>Fact review</span><strong>{qaProspects.filter((item) => item.currentState === 'FACT_QA_PENDING').length}</strong></article>
        <article><span>Sales approval</span><strong>{qaProspects.filter((item) => item.currentState === 'SALES_QA_PENDING').length}</strong></article>
        <article><span>Open issues</span><strong>{openIssues.length}</strong></article>
        <article><span>Ready</span><strong>{qaProspects.filter((item) => item.currentState === 'DEMO_READY').length}</strong></article>
      </section>

      <div className="phase19-layout">
        <aside className="phase19-queue" aria-label="QA approval queue">
          <div className="phase19-section-title"><div><p className="eyebrow">APPROVAL QUEUE</p><h3>Prospects</h3></div><span>{qaProspects.length}</span></div>
          {qaProspects.length === 0 ? <p className="phase19-empty">No prospects are waiting at Phase 19.</p> : qaProspects.map((prospect) => (
            <button
              key={prospect.id}
              type="button"
              className={`phase19-prospect ${selectedProspectId === prospect.id ? 'active' : ''}`}
              onClick={() => { setSelectedProspectId(prospect.id); setSelectedDemoId(null); setNotice(null); }}
            >
              <strong>{prospect.canonicalName}</strong>
              <small>{stateLabel(prospect.currentState)}</small>
            </button>
          ))}

          <div className="phase19-section-title phase19-issues-title"><div><p className="eyebrow">OPEN ISSUES</p><h3>Remediation</h3></div><span>{openIssues.length}</span></div>
          {openIssues.slice(0, 12).map((issue) => (
            <button key={issue.id} type="button" className="phase19-issue-link" onClick={() => chooseIssue(issue)}>
              <span className={`phase19-severity ${issue.severity.toLowerCase()}`}>{issue.severity}</span>
              <strong>{issue.code}</strong>
              <small>{issue.field ?? 'General QA'}</small>
            </button>
          ))}
        </aside>

        <main className="phase19-workspace">
          {!selectedDemoId ? (
            <section className="phase19-empty-panel"><p className="eyebrow">NO DEMO SELECTED</p><h3>Select a QA prospect</h3><p>The latest automated demo will load with its canonical facts and evidence.</p></section>
          ) : inspectionQuery.isPending ? (
            <section className="phase19-empty-panel" aria-busy="true"><p className="eyebrow">LOADING EVIDENCE</p><h3>Verifying provenance…</h3></section>
          ) : inspectionQuery.isError ? (
            <section className="phase19-empty-panel" role="alert"><p className="eyebrow">QA DATA UNAVAILABLE</p><h3>{inspectionQuery.error.message}</h3></section>
          ) : inspection ? (
            <>
              <section className="phase19-demo-head">
                <div><p className="eyebrow">SELECTED DEMO</p><h3>{inspection.prospect.canonicalName}</h3><p>{stateLabel(inspection.prospect.currentState)}</p></div>
                <div className="phase19-head-actions">
                  <a className="secondary-button" href={`${API_BASE_URL}/api/v1/automated-demo/demos/${inspection.demo.id}/preview`} target="_blank" rel="noreferrer">Open private preview</a>
                  {selectedState === 'FACT_QA_PENDING' ? <button className="primary-button" type="button" disabled={busy} onClick={() => runFactQa.mutate()}>Run Fact QA</button> : null}
                </div>
              </section>

              <section className="phase19-status-grid">
                <article><span>Visual QA</span><strong>PASS</strong></article>
                <article><span>Fact QA</span><strong>{inspection.demo.factQaStatus}</strong></article>
                <article><span>Sales QA</span><strong>{inspection.demo.salesQaStatus}</strong></article>
              </section>

              <section className="phase19-panel">
                <div className="phase19-section-title"><div><p className="eyebrow">SOURCE INSPECTION</p><h3>Canonical facts → evidence</h3></div><span>{inspection.facts.length} facts</span></div>
                <div className="phase19-fact-list">
                  {inspection.facts.map((fact) => {
                    const proof = fact.evidenceId ? evidenceById.get(fact.evidenceId) : undefined;
                    return <article className="phase19-fact" key={fact.id}>
                      <div><small>{fact.field}</small><strong>{fact.value}</strong></div>
                      <div className="phase19-proof-meta"><span>{fact.verificationStatus}</span><span>{confidence(fact.confidence)}</span></div>
                      <div className="phase19-proof">
                        {proof ? <><p>{proof.value}</p><small>Captured {new Date(proof.capturedAt).toLocaleDateString()}</small><a href={proof.sourceUrl} target="_blank" rel="noreferrer">Inspect source ↗</a></> : <span className="phase19-warning">No linked evidence</span>}
                      </div>
                    </article>;
                  })}
                </div>
              </section>

              <section className="phase19-panel">
                <div className="phase19-section-title"><div><p className="eyebrow">FACT QA</p><h3>Issues and remediation</h3></div><span>{inspection.factQa?.status ?? 'NOT RUN'}</span></div>
                {!inspection.factQa || inspection.factQa.issues.length === 0 ? <p className="phase19-empty">No Fact QA issues are open in the latest run.</p> : inspection.factQa.issues.map((issue) => (
                  <article className="phase19-issue-card" key={issue.id}>
                    <div className="phase19-issue-top"><span className={`phase19-severity ${issue.severity.toLowerCase()}`}>{issue.severity}</span><strong>{issue.code}</strong><small>{issue.status}</small></div>
                    <p>{issue.message}</p>
                    {issue.evidenceIds.length ? <div className="phase19-evidence-links">{issue.evidenceIds.map((id) => { const proof = evidenceById.get(id); return proof ? <a key={id} href={proof.sourceUrl} target="_blank" rel="noreferrer">{proof.field}: source ↗</a> : <span key={id}>{id}</span>; })}</div> : null}
                    {issue.status === 'OPEN' ? <div className="phase19-resolution"><textarea aria-label={`Resolution note for ${issue.code}`} placeholder="Required remediation / waiver note" value={resolutionNotes[issue.id] ?? ''} onChange={(event) => setResolutionNotes((current) => ({ ...current, [issue.id]: event.target.value }))}/><div><button type="button" disabled={busy || !(resolutionNotes[issue.id] ?? '').trim()} onClick={() => resolveIssue.mutate({ issueId: issue.id, action: 'RESOLVED' })}>Mark resolved</button><button type="button" className="text-button" disabled={busy || !(resolutionNotes[issue.id] ?? '').trim()} onClick={() => resolveIssue.mutate({ issueId: issue.id, action: 'WAIVED' })}>Waive with note</button></div></div> : null}
                  </article>
                ))}
              </section>

              <section className="phase19-panel phase19-sales-panel">
                <div className="phase19-section-title"><div><p className="eyebrow">HUMAN SALES QA</p><h3>Final demo-readiness decision</h3></div><span>{selectedState === 'SALES_QA_PENDING' ? 'ACTION REQUIRED' : stateLabel(selectedState)}</span></div>
                {selectedState === 'SALES_QA_PENDING' ? <>
                  <div className="phase19-checklist">
                    {([
                      ['previewReviewed', 'Private preview reviewed'],
                      ['factsReviewed', 'Visible facts and sources reviewed'],
                      ['ctaReviewed', 'CTA and verified contact path reviewed'],
                      ['screenshotsReviewed', 'Desktop + mobile screenshots reviewed'],
                      ['disclosureReviewed', 'Concept disclosure / noindex reviewed'],
                    ] as const).map(([key, label]) => <label key={key}><input type="checkbox" checked={checklist[key]} onChange={(event) => setChecklist((current) => ({ ...current, [key]: event.target.checked }))}/><span>{label}</span></label>)}
                  </div>
                  <textarea className="phase19-sales-note" aria-label="Sales QA note" placeholder="Optional decision note" value={salesNote} onChange={(event) => setSalesNote(event.target.value)}/>
                  <div className="phase19-sales-actions"><button type="button" className="primary-button" disabled={busy || !allChecklistConfirmed} onClick={() => salesQa.mutate('APPROVED')}>Approve demo</button><button type="button" className="danger-button" disabled={busy} onClick={() => salesQa.mutate('REJECTED')}>Reject demo</button></div>
                  <p className="phase19-safety-note">Approval can make the private demo READY. It does not queue or send outreach; Contact Finder and Outreach phases remain separate gates.</p>
                </> : <p className="phase19-empty">Sales approval becomes available only after Visual QA and Fact QA are both PASS with no open issues.</p>}
              </section>
            </>
          ) : null}
        </main>
      </div>
    </div>
  );
}
