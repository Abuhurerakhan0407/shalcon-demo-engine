import { Navigate, Route, Routes } from 'react-router-dom';

const modules = [
  'Campaigns',
  'Prospects',
  'Research',
  'Templates',
  'Demos',
  'QA Queue',
  'Outreach',
  'Inbox',
  'Pipeline',
  'Analytics',
];

function FoundationPage() {
  return (
    <main className="app-shell">
      <section className="hero-card" aria-labelledby="phase-title">
        <p className="eyebrow">SHALCON INTELLIGENCE</p>
        <h1 id="phase-title">Demo-First Outbound Engine</h1>
        <p className="lede">
          Phase 0 engineering foundation. One renderer, verified prospect data, premium niche
          templates, controlled outreach.
        </p>
        <div className="status-row">
          <span className="status-dot" aria-hidden="true" />
          <span>Foundation workspace active</span>
        </div>
      </section>

      <section className="module-grid" aria-label="Planned product modules">
        {modules.map((module) => (
          <article className="module-card" key={module}>
            <span>{module}</span>
            <small>Planned</small>
          </article>
        ))}
      </section>
    </main>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<FoundationPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
