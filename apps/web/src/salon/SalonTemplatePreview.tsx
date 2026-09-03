import {
  SALON_QA_FIXTURE_LONG,
  SALON_QA_FIXTURE_MINIMAL,
  SALON_QA_FIXTURE_SHORT,
  renderElaneDocument,
  validateSalonTemplateConfig,
  type SalonTemplateConfig,
} from '@shalcon/template-runtime';
import { ELANE_V8_TEMPLATE } from '@shalcon/templates';
import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';

import elaneV8Source from '../../../../packages/templates/generated/elane-v8/index.html?raw';

const fixtures = {
  long: SALON_QA_FIXTURE_LONG,
  short: SALON_QA_FIXTURE_SHORT,
  minimal: SALON_QA_FIXTURE_MINIMAL,
} as const;

function fixtureFromSearch(search: string): SalonTemplateConfig {
  const requested = new URLSearchParams(search).get('fixture');
  if (requested === 'short') return fixtures.short;
  if (requested === 'minimal') return fixtures.minimal;
  return fixtures.long;
}

export function SalonTemplatePreview() {
  const location = useLocation();
  const config = fixtureFromSearch(location.search);
  const validation = validateSalonTemplateConfig(config);

  const documentHtml = useMemo(() => {
    if (!validation.ok) return null;
    return renderElaneDocument(elaneV8Source, config);
  }, [config, validation.ok]);

  if (!validation.ok || !documentHtml) {
    return (
      <main className="center-state" role="alert">
        <p className="eyebrow">ÉLANE V8 / CONFIG REJECTED</p>
        <h1>Template fixture rejected</h1>
        <p>{validation.errors.join(' · ')}</p>
      </main>
    );
  }

  return (
    <iframe
      title={`${config.business.name} — ${ELANE_V8_TEMPLATE.id} preview`}
      data-template-id={ELANE_V8_TEMPLATE.id}
      data-template-version={ELANE_V8_TEMPLATE.version}
      data-fixture={config.fixtureLabel ?? 'concept-preview'}
      srcDoc={documentHtml}
      style={{
        position: 'fixed',
        inset: 0,
        display: 'block',
        width: '100%',
        height: '100%',
        border: 0,
        background: '#f2eee8',
      }}
    />
  );
}
