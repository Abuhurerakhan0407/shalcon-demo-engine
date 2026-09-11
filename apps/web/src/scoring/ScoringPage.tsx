import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';

import './scoring.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8787';

interface Prospect {
  id: string;
  canonicalName: string;
  currentState: string;
  domain: string | null;
  city: string | null;
}

type ComponentKey =
  | 'businessNicheFit'
  | 'websiteNeed'
  | 'verifiedData'
  | 'brandSignals'
  | 'abilityToPaySignals'
  | 'contactability'
  | 'recentActivity';

interface ScoreReference {
  kind: 'EVIDENCE' | 'AUDIT_RUN' | 'SOURCE';
  id: string;
}

interface ScoreComponent {
  key: ComponentKey;
  points: number;
  maxPoints: number;
  references: ScoreReference[];
  reason: string;
}

interface ScoreRun {
  id: string;
  prospectId: string;
  scoreType: string;
  score: {
    total: number;
    band: 'PRIORITY_DEMO' | 'GENERATE_DEMO' | 'RESEARCH_MORE' | 'SKIP';
    decision: 'DEMO_QUALIFIED' | 'RESEARCH_MORE' | 'REJECTED';
    components: Record<ComponentKey, ScoreComponent>;
  };
  createdAt: string;
}

const componentLabels: Record<ComponentKey, string> = {
  businessNicheFit: 'Business / niche fit',
  websiteNeed: 'Website need',
  verifiedData: 'Available verified data',
  brandSignals: 'Usable brand signals',
  abilityToPaySignals: 'Business-capacity signals',
  contactability: 'Contactability',
  recentActivity: 'Recent activity',
};

async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: 'include',
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(payload?.error?.message ?? `Request failed with ${response.status}.`);
  }
  return response.json() as Promise<T>;
}

function stateLabel(value: string): string {
  return value.replaceAll('_', ' ').toLowerCase();
}

function bandLabel(value: ScoreRun['score']['band']): string {
  return value.replaceAll('_', ' ');
}

export function ScoringPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
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

  const historyQuery = useQuery({
    queryKey: ['demo-worthiness', selectedId],
    queryFn: () => apiJson<{ runs: ScoreRun[] }>(`/api/v1/scoring/prospects/${selectedId}/runs`),
    enabled: Boolean(selectedId),
  });
  const selected = prospects.find((item) => item.id === selectedId) ?? null;
  const latest = historyQuery.data?.runs[0] ?? null;

  async function runScoring() {
    if (!selectedId) return;
    setRunning(true);
    setActionError(null);
    try {
      await apiJson<{ run: ScoreRun }>(`/api/v1/scoring/prospects/${selectedId}/runs`, { method: 'POST' });
      await Promise.all([historyQuery.refetch(), prospectsQuery.refetch()]);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Scoring failed.');
    } finally {
      setRunning(false);
    }
  }

  if (prospectsQuery.isPending) {
    return <section className="scoring-state" aria-busy="true">Loading score workspace…</section>;
  }
  if (prospectsQuery.isError) {
    return <section className="scoring-state" role="alert">Score workspace unavailable.</section>;
  }

  return (
    <div className="scoring-page">
      <header className="scoring-hero">
        <div>
          <p className="eyebrow">DEMO WORTHINESS / 100</p>
          <h2>Evidence becomes a decision.</h2>
          <p>
            Seven evidence-linked components feed one deterministic total. Missing evidence earns no
            points, and AI cannot override the numeric result or threshold state.
          </p>
        </div>
        <div className="scoring-thresholds" aria-label="Score thresholds">
          <span><strong>85+</strong> Priority demo</span>
          <span><strong>70+</strong> Generate demo</span>
          <span><strong>50+</strong> Research more</span>
          <span><strong>&lt;50</strong> Skip</span>
        </div>
      </header>

      {prospects.length === 0 ? (
        <section className="scoring-state"><strong>No prospects available.</strong><p>Complete research and website audit first.</p></section>
      ) : (
        <div className="scoring-workspace">
          <aside className="scoring-prospects" aria-label="Scoring prospects">
            <div className="scoring-list-head"><span>{prospects.length} prospects</span><small>decision ledger</small></div>
            {prospects.map((prospect) => (
              <button
                type="button"
                key={prospect.id}
                className={selectedId === prospect.id ? 'active' : ''}
                onClick={() => { setSelectedId(prospect.id); setActionError(null); }}
              >
                <div><strong>{prospect.canonicalName}</strong><small>{prospect.domain ?? prospect.city ?? 'Sparse identity data'}</small></div>
                <span>{stateLabel(prospect.currentState)}</span>
              </button>
            ))}
          </aside>

          <section className="scoring-detail">
            {selected ? (
              <div className="scoring-toolbar">
                <div><p className="eyebrow">CURRENT PROSPECT</p><h3>{selected.canonicalName}</h3><p>{stateLabel(selected.currentState)}</p></div>
                <button
                  className="primary-button"
                  type="button"
                  disabled={selected.currentState !== 'AUDITED' || running}
                  onClick={() => void runScoring()}
                >
                  {running ? 'Scoring…' : 'Calculate deterministic score'}
                </button>
              </div>
            ) : null}
            {selected && selected.currentState !== 'AUDITED' && !latest ? (
              <div className="scoring-note">Scoring activates only after an evidence-backed website audit reaches AUDITED state.</div>
            ) : null}
            {actionError ? <div className="scoring-error" role="alert">{actionError}</div> : null}
            {historyQuery.isPending ? <div className="scoring-state">Loading score history…</div> : null}
            {historyQuery.isError ? <div className="scoring-state" role="alert">Score history unavailable.</div> : null}

            {latest ? (
              <>
                <section className="score-summary" aria-label="Latest demo worthiness score">
                  <div className="score-total"><span>{latest.score.total}</span><small>/ 100</small></div>
                  <div><p className="eyebrow">DETERMINISTIC OUTCOME</p><h3>{bandLabel(latest.score.band)}</h3><p>Pipeline state: {stateLabel(latest.score.decision)}</p></div>
                  <div className="score-lock">CODE CALCULATED<br/><strong>AI cannot override</strong></div>
                </section>

                <section className="score-components" aria-label="Score component breakdown">
                  {Object.values(latest.score.components).map((component) => (
                    <article key={component.key}>
                      <header><div><span>{componentLabels[component.key]}</span><strong>{component.points} / {component.maxPoints}</strong></div><progress value={component.points} max={component.maxPoints}/></header>
                      <p>{component.reason}</p>
                      <footer>{component.references.length > 0 ? `${component.references.length} evidence reference${component.references.length === 1 ? '' : 's'}` : 'No evidence reference'}</footer>
                    </article>
                  ))}
                </section>

                <section className="score-history" aria-label="Score history">
                  <div><p className="eyebrow">AUDIT HISTORY</p><h3>Immutable score runs</h3></div>
                  {(historyQuery.data?.runs ?? []).map((run) => (
                    <article key={run.id}><span>{new Date(run.createdAt).toLocaleString()}</span><strong>{run.score.total}/100 · {bandLabel(run.score.band)}</strong></article>
                  ))}
                </section>
              </>
            ) : historyQuery.isSuccess ? <div className="scoring-state">No demo-worthiness score has been recorded yet.</div> : null}
          </section>
        </div>
      )}
    </div>
  );
}
