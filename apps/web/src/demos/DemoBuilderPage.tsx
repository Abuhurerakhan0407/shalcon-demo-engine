import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState, type FormEvent } from 'react';

import './demo-builder.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8787';

type ThemePreset = 'WARM_STONE' | 'ELANE_PAPER';
type HideableField = 'descriptor' | 'city' | 'area' | 'address' | 'hours' | 'contact';

interface Prospect {
  id: string;
  canonicalName: string;
  city: string | null;
  currentState: string;
  updatedAt: string;
}

interface Fact {
  id: string;
  field: string;
  value: string;
  confidence: number;
  evidenceId: string | null;
  verificationStatus: string;
}

interface Evidence {
  id: string;
  field: string;
  value: string;
  sourceUrl: string;
  sourceQuality: number;
  confidence: number;
  verificationStatus: string;
}

interface DemoSummary {
  id: string;
  prospectId: string;
  status: string;
  templateId: string;
  templateVersion: string;
  expiresAt: string | null;
  updatedAt: string;
  factQaStatus: string;
  visualQaStatus: string;
  salesQaStatus: string;
}

interface BuilderInput {
  themePreset: ThemePreset;
  headline: string;
  accentHeadline: string;
  subhead: string;
  hiddenFields: HideableField[];
}

interface ProspectBuilderDetail {
  prospect: Prospect;
  eligible: boolean;
  verifiedFacts: Fact[];
  evidence: Evidence[];
  demos: DemoSummary[];
  builderContract: {
    templateId: string;
    templateVersion: string;
    themePresets: ThemePreset[];
    hideableFields: HideableField[];
    defaultInput: BuilderInput;
    previewExpiryDays: number;
    ctaPolicy: string;
  };
}

interface DemoDetail {
  demo: DemoSummary;
  prospect: Prospect;
  builder: {
    revision: number;
    input: BuilderInput;
    visibleFields: Array<{ field: string; value: string; evidenceId: string; confidence: number }>;
    evidenceMap: Record<string, string[]>;
    contactMode: string;
  };
  verifiedFacts: Fact[];
  visibleEvidence: Evidence[];
  previewPath: string;
  previewUrl: string;
}

const FALLBACK_INPUT: BuilderInput = {
  themePreset: 'WARM_STONE',
  headline: 'A sharper',
  accentHeadline: 'first impression.',
  subhead: 'A private website concept built around a cleaner, more confident first impression.',
  hiddenFields: [],
};

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

function shortEvidence(id: string | null) {
  if (!id) return 'No evidence';
  return id.length > 18 ? `${id.slice(0, 9)}…${id.slice(-5)}` : id;
}

export function DemoBuilderPage() {
  const queryClient = useQueryClient();
  const [selectedProspectId, setSelectedProspectId] = useState<string | null>(null);
  const [selectedDemoId, setSelectedDemoId] = useState<string | null>(null);
  const [form, setForm] = useState<BuilderInput>(FALLBACK_INPUT);
  const [viewport, setViewport] = useState<'desktop' | 'mobile'>('desktop');
  const [notice, setNotice] = useState<string | null>(null);

  const prospectsQuery = useQuery({
    queryKey: ['prospects'],
    queryFn: () => apiJson<{ prospects: Prospect[] }>('/api/v1/prospects'),
  });
  const prospects = useMemo(
    () => (prospectsQuery.data?.prospects ?? []).filter((prospect) => prospect.currentState !== 'DUPLICATE'),
    [prospectsQuery.data],
  );

  useEffect(() => {
    if (!selectedProspectId && prospects[0]) setSelectedProspectId(prospects[0].id);
    if (selectedProspectId && !prospects.some((item) => item.id === selectedProspectId)) {
      setSelectedProspectId(prospects[0]?.id ?? null);
    }
  }, [prospects, selectedProspectId]);

  const prospectDetailQuery = useQuery({
    queryKey: ['demo-builder-prospect', selectedProspectId],
    queryFn: () => apiJson<ProspectBuilderDetail>(`/api/v1/demo-admin/prospects/${selectedProspectId}`),
    enabled: Boolean(selectedProspectId),
  });

  useEffect(() => {
    if (!prospectDetailQuery.data) return;
    setForm(prospectDetailQuery.data.builderContract.defaultInput);
    const latestDemo = prospectDetailQuery.data.demos[0];
    setSelectedDemoId(latestDemo?.id ?? null);
  }, [selectedProspectId, prospectDetailQuery.data]);

  const demoDetailQuery = useQuery({
    queryKey: ['demo-builder-demo', selectedDemoId],
    queryFn: () => apiJson<DemoDetail>(`/api/v1/demo-admin/demos/${selectedDemoId}`),
    enabled: Boolean(selectedDemoId),
  });

  useEffect(() => {
    if (demoDetailQuery.data?.builder.input) setForm(demoDetailQuery.data.builder.input);
  }, [selectedDemoId, demoDetailQuery.data]);

  const createDemo = useMutation({
    mutationFn: () =>
      apiJson<DemoDetail>(`/api/v1/demo-admin/prospects/${selectedProspectId}/demos`, {
        method: 'POST',
        body: JSON.stringify(form),
      }),
    onSuccess: async (detail) => {
      setSelectedDemoId(detail.demo.id);
      setNotice('Private demo generated from verified facts. No code or deployment changed.');
      await queryClient.invalidateQueries({ queryKey: ['demo-builder-prospect', selectedProspectId] });
      queryClient.setQueryData(['demo-builder-demo', detail.demo.id], detail);
    },
    onError: (error: Error) => setNotice(error.message),
  });

  const regenerateDemo = useMutation({
    mutationFn: () =>
      apiJson<DemoDetail>(`/api/v1/demo-admin/demos/${selectedDemoId}`, {
        method: 'PUT',
        body: JSON.stringify(form),
      }),
    onSuccess: async (detail) => {
      setNotice(`Revision ${detail.builder.revision} rendered from the same ${detail.demo.templateId}@${detail.demo.templateVersion} deployment.`);
      queryClient.setQueryData(['demo-builder-demo', detail.demo.id], detail);
      await queryClient.invalidateQueries({ queryKey: ['demo-builder-prospect', selectedProspectId] });
    },
    onError: (error: Error) => setNotice(error.message),
  });

  const disableDemo = useMutation({
    mutationFn: () =>
      apiJson<{ demo: DemoSummary }>(`/api/v1/demo-admin/demos/${selectedDemoId}/disable`, {
        method: 'POST',
      }),
    onSuccess: async () => {
      setNotice('Preview disabled. Its private URL now fails closed. Regenerate to issue the same demo again.');
      await queryClient.invalidateQueries({ queryKey: ['demo-builder-demo', selectedDemoId] });
      await queryClient.invalidateQueries({ queryKey: ['demo-builder-prospect', selectedProspectId] });
    },
    onError: (error: Error) => setNotice(error.message),
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (selectedDemoId) regenerateDemo.mutate();
    else createDemo.mutate();
  }

  function toggleHidden(field: HideableField) {
    setForm((current) => ({
      ...current,
      hiddenFields: current.hiddenFields.includes(field)
        ? current.hiddenFields.filter((item) => item !== field)
        : [...current.hiddenFields, field],
    }));
  }

  const prospectDetail = prospectDetailQuery.data;
  const demoDetail = demoDetailQuery.data;
  const busy = createDemo.isPending || regenerateDemo.isPending || disableDemo.isPending;

  return (
    <div className="demo-builder-page">
      <header className="demo-builder-heading">
        <div>
          <p className="eyebrow">PHASE 07 / MANUAL DEMO BUILDER</p>
          <h2>Verified facts in. Private demo out.</h2>
          <p>
            One ÉLANE deployment. Prospect-specific configuration only. Unsupported facts stay hidden.
          </p>
        </div>
        <div className="demo-phase-chip"><span>07</span><small>Sale-capable slice</small></div>
      </header>

      {notice ? (
        <div className="demo-notice" role="status">
          <p>{notice}</p>
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss notice">×</button>
        </div>
      ) : null}

      <div className="demo-builder-layout">
        <aside className="demo-prospect-rail" aria-label="Prospects eligible for demo building">
          <div className="rail-title"><strong>Prospects</strong><small>{prospects.length} canonical</small></div>
          {prospects.map((prospect) => (
            <button
              type="button"
              key={prospect.id}
              className={`demo-prospect-row ${selectedProspectId === prospect.id ? 'active' : ''}`}
              onClick={() => {
                setSelectedProspectId(prospect.id);
                setSelectedDemoId(null);
                setNotice(null);
              }}
            >
              <span>{prospect.canonicalName}</span>
              <small>{prospect.currentState}</small>
            </button>
          ))}
          {prospects.length === 0 ? <p className="rail-empty">Add and verify a Salon & Spa prospect first.</p> : null}
        </aside>

        <section className="demo-control-panel">
          {prospectDetailQuery.isPending ? <p className="panel-loading">Loading verified prospect data…</p> : null}
          {prospectDetailQuery.isError ? <p className="panel-error">Prospect demo data unavailable.</p> : null}
          {prospectDetail ? (
            <>
              <div className="selected-prospect">
                <div>
                  <p className="eyebrow">PROSPECT DETAIL</p>
                  <h3>{prospectDetail.prospect.canonicalName}</h3>
                </div>
                <span className={prospectDetail.eligible ? 'eligible' : 'blocked'}>
                  {prospectDetail.eligible ? 'Identity verified' : 'Identity gate blocked'}
                </span>
              </div>

              <section className="verified-facts" aria-label="Verified facts">
                <div className="section-mini-heading">
                  <strong>Verified inputs</strong>
                  <small>{prospectDetail.verifiedFacts.length} evidence-backed facts</small>
                </div>
                <div className="fact-grid">
                  {prospectDetail.verifiedFacts.map((fact) => (
                    <article key={fact.id} className="fact-chip">
                      <span>{fact.field}</span>
                      <strong>{fact.value}</strong>
                      <small>{shortEvidence(fact.evidenceId)} · {Math.round(fact.confidence * 100)}%</small>
                    </article>
                  ))}
                  {prospectDetail.verifiedFacts.length === 0 ? (
                    <p className="facts-empty">Only the verified business identity will render. Optional facts remain hidden.</p>
                  ) : null}
                </div>
              </section>

              <form className="demo-config-form" onSubmit={submit}>
                <div className="section-mini-heading">
                  <strong>Content + controlled DNA</strong>
                  <small>{prospectDetail.builderContract.templateId}@{prospectDetail.builderContract.templateVersion}</small>
                </div>
                <label>
                  Theme preset
                  <select
                    value={form.themePreset}
                    onChange={(event) => setForm((current) => ({ ...current, themePreset: event.target.value as ThemePreset }))}
                  >
                    {prospectDetail.builderContract.themePresets.map((preset) => <option key={preset}>{preset}</option>)}
                  </select>
                </label>
                <div className="copy-grid">
                  <label>
                    Hero line
                    <input value={form.headline} maxLength={72} onChange={(event) => setForm((current) => ({ ...current, headline: event.target.value }))} />
                  </label>
                  <label>
                    Accent line
                    <input value={form.accentHeadline} maxLength={72} onChange={(event) => setForm((current) => ({ ...current, accentHeadline: event.target.value }))} />
                  </label>
                </div>
                <label>
                  Safe subhead
                  <textarea value={form.subhead} maxLength={220} rows={3} onChange={(event) => setForm((current) => ({ ...current, subhead: event.target.value }))} />
                </label>
                <fieldset className="visibility-fieldset">
                  <legend>Hide verified fields from this demo</legend>
                  <div className="visibility-grid">
                    {prospectDetail.builderContract.hideableFields.map((field) => (
                      <label key={field}>
                        <input type="checkbox" checked={form.hiddenFields.includes(field)} onChange={() => toggleHidden(field)} />
                        <span>{field}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
                <div className="cta-policy">
                  <span>CTA safety</span>
                  <p>{prospectDetail.builderContract.ctaPolicy}</p>
                </div>
                <button className="primary-button" disabled={!prospectDetail.eligible || busy} type="submit">
                  {busy ? 'Rendering…' : selectedDemoId ? 'Regenerate configuration' : 'Generate private demo'}
                </button>
              </form>

              {prospectDetail.demos.length > 0 ? (
                <section className="demo-history">
                  <div className="section-mini-heading"><strong>Demo revisions</strong><small>latest first</small></div>
                  <div className="demo-history-list">
                    {prospectDetail.demos.map((demo) => (
                      <button className={selectedDemoId === demo.id ? 'active' : ''} type="button" key={demo.id} onClick={() => setSelectedDemoId(demo.id)}>
                        <span>{demo.templateId}@{demo.templateVersion}</span><small>{demo.status}</small>
                      </button>
                    ))}
                  </div>
                </section>
              ) : null}
            </>
          ) : null}
        </section>

        <section className="demo-preview-panel">
          <div className="preview-toolbar">
            <div>
              <p className="eyebrow">DEMO DETAIL</p>
              <strong>{demoDetail ? `Revision ${demoDetail.builder.revision}` : 'No demo yet'}</strong>
            </div>
            <div className="viewport-switch" aria-label="Preview viewport">
              <button type="button" className={viewport === 'desktop' ? 'active' : ''} onClick={() => setViewport('desktop')}>Desktop</button>
              <button type="button" className={viewport === 'mobile' ? 'active' : ''} onClick={() => setViewport('mobile')}>Mobile</button>
            </div>
          </div>

          {demoDetailQuery.isPending && selectedDemoId ? <p className="panel-loading">Loading private preview…</p> : null}
          {demoDetail ? (
            <>
              <div className="demo-meta-grid">
                <span><small>Status</small><strong>{demoDetail.demo.status}</strong></span>
                <span><small>Template</small><strong>{demoDetail.demo.templateId}@{demoDetail.demo.templateVersion}</strong></span>
                <span><small>CTA mode</small><strong>{demoDetail.builder.contactMode}</strong></span>
                <span><small>Expires</small><strong>{demoDetail.demo.expiresAt ? new Date(demoDetail.demo.expiresAt).toLocaleDateString() : 'No expiry'}</strong></span>
              </div>

              <div className={`live-demo-frame ${viewport}`}>
                {demoDetail.demo.status === 'DISABLED' ? (
                  <div className="disabled-preview"><strong>Preview disabled</strong><p>The private URL currently fails closed.</p></div>
                ) : (
                  <iframe title={`${demoDetail.prospect.canonicalName} private demo`} src={demoDetail.previewUrl} />
                )}
              </div>

              <div className="preview-actions">
                <a href={demoDetail.previewUrl} target="_blank" rel="noreferrer">Open private preview ↗</a>
                <button type="button" disabled={busy || demoDetail.demo.status === 'DISABLED'} onClick={() => disableDemo.mutate()}>Disable preview</button>
              </div>

              <section className="visible-data-list">
                <div className="section-mini-heading"><strong>Visible prospect facts</strong><small>evidence mapped</small></div>
                {demoDetail.builder.visibleFields.map((field) => (
                  <div key={field.field}><span>{field.field}</span><strong>{field.value}</strong><small>{shortEvidence(field.evidenceId)}</small></div>
                ))}
                {demoDetail.builder.visibleFields.length === 0 ? <p>No optional prospect facts are visible.</p> : null}
              </section>

              <div className="qa-strip">
                <span><small>Fact QA</small>{demoDetail.demo.factQaStatus}</span>
                <span><small>Visual QA</small>{demoDetail.demo.visualQaStatus}</span>
                <span><small>Sales QA</small>{demoDetail.demo.salesQaStatus}</span>
              </div>
              <p className="phase-note">Desktop/mobile live render is active now. Screenshot package and automated visual QA arrive in Phase 18—nothing fake is shown here.</p>
            </>
          ) : (
            <div className="preview-empty"><span>00</span><strong>Generate the first private demo.</strong><p>The same deployed ÉLANE renderer will read this prospect’s validated D1 configuration.</p></div>
          )}
        </section>
      </div>
    </div>
  );
}
