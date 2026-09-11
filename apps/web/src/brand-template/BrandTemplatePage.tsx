import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import './brand-template.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8787';

type ThemeDNA = {
  paletteId: string; typographyId: string; radius: string; density: string;
  heroVariant: string; imageTreatment: string; motionPreset: string;
};
type Prospect = { id: string; canonicalName: string; currentState: string; domain: string | null; city: string | null };
type RegistryTemplate = { id: string; version: string; niche: string; archetype: string; defaultTheme: ThemeDNA; requiredFields: string[] };
type RegistryResponse = { templates: RegistryTemplate[]; themeOptions: Record<keyof ThemeDNA, string[]> };
type Run = {
  brandProfile: { id: string; profileVersion: string; positioning: string; confidence: number; detectedColors: string[]; evidenceIds: string[]; safeDefault: boolean; createdAt: string };
  match: { id: string; matcherVersion: string; templateId: string; templateVersion: string; archetype: string; themeDNA: ThemeDNA; fitScore: number; confidence: number; reasons: string[]; evidenceIds: string[]; safeDefault: boolean; sparseContentMode: boolean; selectionSource: 'AUTO' | 'MANUAL_OVERRIDE'; createdAt: string };
};

async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, { ...init, credentials: 'include' });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(payload?.error?.message ?? `Request failed with ${response.status}.`);
  }
  return response.json() as Promise<T>;
}
const stateLabel = (value: string) => value.replaceAll('_', ' ').toLowerCase();
const pct = (value: number) => `${Math.round(value * 100)}%`;
const labels: Record<keyof ThemeDNA, string> = {
  paletteId: 'Palette', typographyId: 'Typography', radius: 'Radius', density: 'Density',
  heroVariant: 'Hero', imageTreatment: 'Images', motionPreset: 'Motion',
};

export function BrandTemplatePage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [templateKey, setTemplateKey] = useState('');
  const [theme, setTheme] = useState<ThemeDNA | null>(null);
  const prospectsQuery = useQuery({ queryKey: ['prospects'], queryFn: () => apiJson<{ prospects: Prospect[] }>('/api/v1/prospects') });
  const registryQuery = useQuery({ queryKey: ['template-registry'], queryFn: () => apiJson<RegistryResponse>('/api/v1/brand-template/registry') });
  const prospects = useMemo(() => prospectsQuery.data?.prospects ?? [], [prospectsQuery.data]);
  useEffect(() => { if (!selectedId && prospects[0]) setSelectedId(prospects[0].id); }, [prospects, selectedId]);
  const historyQuery = useQuery({
    queryKey: ['brand-template-history', selectedId],
    queryFn: () => apiJson<{ runs: Run[] }>(`/api/v1/brand-template/prospects/${selectedId}/matches`),
    enabled: Boolean(selectedId),
  });
  const selected = prospects.find((item) => item.id === selectedId) ?? null;
  const latest = historyQuery.data?.runs[0] ?? null;
  const registry = registryQuery.data ?? null;
  useEffect(() => {
    const first = registry?.templates[0];
    if (!first) return;
    const current = latest ? registry.templates.find((item) => item.id === latest.match.templateId && item.version === latest.match.templateVersion) : null;
    const template = current ?? first;
    setTemplateKey(`${template.id}@${template.version}`);
    setTheme(latest?.match.themeDNA ?? template.defaultTheme);
  }, [latest, registry]);

  async function runMatch() {
    if (!selectedId) return;
    setBusy(true); setError(null);
    try {
      await apiJson(`/api/v1/brand-template/prospects/${selectedId}/matches`, { method: 'POST' });
      await Promise.all([historyQuery.refetch(), prospectsQuery.refetch()]);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Template matching failed.'); }
    finally { setBusy(false); }
  }
  async function saveOverride() {
    if (!selectedId || !latest || !registry || !theme) return;
    const template = registry.templates.find((item) => `${item.id}@${item.version}` === templateKey);
    if (!template) return;
    setBusy(true); setError(null);
    try {
      await apiJson(`/api/v1/brand-template/prospects/${selectedId}/matches/${latest.match.id}/override`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId: template.id, templateVersion: template.version, themeDNA: theme }),
      });
      await historyQuery.refetch();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Template override failed.'); }
    finally { setBusy(false); }
  }

  if (prospectsQuery.isPending || registryQuery.isPending) return <section className="brand-template-state">Loading brand workspace…</section>;
  if (prospectsQuery.isError || registryQuery.isError) return <section className="brand-template-state" role="alert">Brand/template workspace unavailable.</section>;

  return <div className="brand-template-page">
    <header className="brand-template-hero"><div><p className="eyebrow">BRAND ANALYZER / TEMPLATE MATCHER</p><h2>Brand evidence becomes controlled design.</h2><p>Explicit evidence can guide a registered template. Unknown signals fall back safely; no palette story or arbitrary CSS is invented.</p></div><div className="registry-count"><strong>{registry?.templates.length ?? 0}</strong><span>allowed template versions</span></div></header>
    {prospects.length === 0 ? <section className="brand-template-state">No prospects available.</section> : <div className="brand-template-workspace">
      <aside className="brand-template-prospects">{prospects.map((prospect) => <button type="button" className={selectedId === prospect.id ? 'active' : ''} key={prospect.id} onClick={() => { setSelectedId(prospect.id); setError(null); }}><strong>{prospect.canonicalName}</strong><small>{prospect.domain ?? prospect.city ?? 'Sparse identity data'}</small><span>{stateLabel(prospect.currentState)}</span></button>)}</aside>
      <section className="brand-template-detail">
        {selected ? <div className="brand-template-toolbar"><div><p className="eyebrow">CURRENT PROSPECT</p><h3>{selected.canonicalName}</h3><small>{stateLabel(selected.currentState)}</small></div><button className="primary-button" type="button" disabled={busy || selected.currentState !== 'DEMO_QUALIFIED'} onClick={() => void runMatch()}>{busy ? 'Working…' : 'Analyze + match'}</button></div> : null}
        {error ? <div className="brand-template-error" role="alert">{error}</div> : null}
        {latest ? <>
          <section className="brand-profile-card"><div><p className="eyebrow">EVIDENCE-BOUND PROFILE</p><h3>{latest.brandProfile.positioning}</h3><p>{pct(latest.brandProfile.confidence)} confidence · {latest.brandProfile.evidenceIds.length} evidence refs</p></div><span>{latest.brandProfile.safeDefault ? 'SAFE DEFAULT' : 'EXPLICIT SIGNALS'}</span><div><small>Observed colors</small><p>{latest.brandProfile.detectedColors.length ? latest.brandProfile.detectedColors.join(' · ') : 'None explicit — no palette story invented.'}</p></div></section>
          <section className="template-match-card"><div className="fit-score"><strong>{latest.match.fitScore}</strong><small>/100 fit</small></div><div><p className="eyebrow">{latest.match.selectionSource}</p><h3>{latest.match.templateId} · v{latest.match.templateVersion}</h3><p>{latest.match.archetype}</p><small>{latest.match.sparseContentMode ? 'Sparse-compatible layout · ' : ''}{pct(latest.match.confidence)} confidence</small></div><dl>{Object.entries(latest.match.themeDNA).map(([key, value]) => <div key={key}><dt>{labels[key as keyof ThemeDNA] ?? key}</dt><dd>{value}</dd></div>)}</dl></section>
          <section className="match-reasons"><p className="eyebrow">SELECTION EXPLANATION</p><ol>{latest.match.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ol></section>
          {selected?.currentState === 'TEMPLATE_MATCHED' && registry && theme ? <section className="manual-override"><div><p className="eyebrow">HUMAN OVERRIDE</p><h3>Change a mismatch inside the registry.</h3><p>The old selection remains in immutable history.</p></div><label>Template<select value={templateKey} onChange={(event) => { const key = event.target.value; setTemplateKey(key); const item = registry.templates.find((candidate) => `${candidate.id}@${candidate.version}` === key); if (item) setTheme(item.defaultTheme); }}>{registry.templates.map((item) => <option value={`${item.id}@${item.version}`} key={`${item.id}@${item.version}`}>{item.id} · v{item.version}</option>)}</select></label><div className="theme-controls">{(Object.keys(labels) as Array<keyof ThemeDNA>).map((key) => <label key={key}>{labels[key]}<select value={theme[key]} onChange={(event) => setTheme({ ...theme, [key]: event.target.value })}>{registry.themeOptions[key].map((option) => <option key={option}>{option}</option>)}</select></label>)}</div><button className="primary-button" disabled={busy} type="button" onClick={() => void saveOverride()}>Save logged override</button></section> : null}
          <section className="brand-template-history"><p className="eyebrow">VERSIONED HISTORY</p>{(historyQuery.data?.runs ?? []).map((run) => <article key={run.match.id}><span>{new Date(run.match.createdAt).toLocaleString()}</span><strong>{run.match.templateId} v{run.match.templateVersion}</strong><small>{run.match.selectionSource} · {run.match.matcherVersion}</small></article>)}</section>
        </> : historyQuery.isSuccess ? <div className="brand-template-state">No brand/template selection has been recorded yet.</div> : <div className="brand-template-state">Loading selection history…</div>}
      </section>
    </div>}
  </div>;
}
