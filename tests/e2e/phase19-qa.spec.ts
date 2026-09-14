import { expect, test, type Page } from '@playwright/test';

const fixtureUser = {
  id: 'fixture-user',
  email: 'operator@example.invalid',
  name: 'Shalcon Operator',
};

async function mockSession(page: Page) {
  await page.route('**/mock-api/api/v1/auth/session', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ user: fixtureUser }),
    });
  });
}

function evidenceInspection(currentState: string, issueStatus: 'OPEN' | 'RESOLVED' | null = null) {
  const issue = issueStatus ? {
    id: 'issue_stale_city',
    qaRunId: 'qa_fact_1',
    demoId: 'demo_phase19',
    qaType: 'FACT_PHASE19',
    code: 'STALE_EVIDENCE_REVIEW',
    field: 'city',
    severity: 'REVIEW',
    message: 'Visible city evidence is older than the Phase 19 freshness threshold.',
    evidenceIds: ['ev_city'],
    status: issueStatus,
    createdAt: '2026-09-14T00:00:00.000Z',
    resolvedAt: issueStatus === 'RESOLVED' ? '2026-09-14T00:01:00.000Z' : null,
    resolvedByUserId: issueStatus === 'RESOLVED' ? fixtureUser.id : null,
    resolutionNote: issueStatus === 'RESOLVED' ? 'Verified refreshed source.' : null,
  } : null;
  return {
    demo: {
      id: 'demo_phase19',
      prospectId: 'prospect_phase19',
      factQaStatus: currentState === 'FACT_QA_PENDING' ? 'REVIEW_PHASE19' : 'PASS',
      salesQaStatus: 'PENDING_PHASE19',
    },
    prospect: {
      id: 'prospect_phase19',
      canonicalName: 'Élan Studio Mumbai',
      currentState,
    },
    facts: [{
      id: 'fact_city',
      field: 'city',
      value: 'Mumbai',
      verificationStatus: 'VERIFIED',
      confidence: 0.97,
      evidenceId: 'ev_city',
    }],
    evidence: [{
      id: 'ev_city',
      field: 'city',
      value: 'Mumbai',
      sourceUrl: 'https://elan.example.com/contact',
      sourceQuality: 1,
      confidence: 0.97,
      verificationStatus: 'VERIFIED',
      capturedAt: '2026-09-10T00:00:00.000Z',
    }],
    factQa: currentState === 'FACT_QA_PENDING' || issue
      ? { id: 'qa_fact_1', status: issueStatus === 'OPEN' ? 'REVIEW' : 'PASS', checks: {}, issues: issue ? [issue] : [] }
      : { id: 'qa_fact_1', status: 'PASS', checks: {}, issues: [] },
  };
}

async function mockCommonPhase19(page: Page, getState: () => string) {
  await mockSession(page);
  await page.route('**/mock-api/api/v1/prospects', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        prospects: [{
          id: 'prospect_phase19',
          canonicalName: 'Élan Studio Mumbai',
          currentState: getState(),
        }],
      }),
    });
  });
  await page.route('**/mock-api/api/v1/automated-demo/prospects/prospect_phase19/builds', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ builds: [{ id: 'build_1', demoId: 'demo_phase19', createdAt: '2026-09-14T00:00:00.000Z' }] }),
    });
  });
}

test('human sales approval requires the complete checklist and keeps outreach separate', async ({ page }) => {
  let prospectState = 'SALES_QA_PENDING';
  let postedDecision: Record<string, unknown> | null = null;
  await mockCommonPhase19(page, () => prospectState);
  await page.route('**/mock-api/api/v1/automated-demo/phase19/review-queue', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ issues: [] }) });
  });
  await page.route('**/mock-api/api/v1/automated-demo/phase19/demos/demo_phase19/evidence', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(evidenceInspection(prospectState)) });
  });
  await page.route('**/mock-api/api/v1/automated-demo/phase19/demos/demo_phase19/sales-qa', async (route) => {
    postedDecision = route.request().postDataJSON() as Record<string, unknown>;
    prospectState = 'DEMO_READY';
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        result: { decision: 'APPROVED', nextState: 'DEMO_READY', demoStatus: 'READY' },
        publicReleaseAvailable: true,
        outreachSendingAvailable: false,
      }),
    });
  });

  await page.goto('/qa');
  await expect(page.getByRole('heading', { name: 'Nothing becomes ready on vibes.' })).toBeVisible();
  await expect(page.getByText('Élan Studio Mumbai').first()).toBeVisible();
  await expect(page.getByText('Mumbai', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: 'Inspect source ↗' })).toHaveAttribute('href', 'https://elan.example.com/contact');
  await expect(page.getByText('Sending remains disabled')).toBeVisible();

  const approve = page.getByRole('button', { name: 'Approve demo' });
  await expect(approve).toBeDisabled();
  for (const label of [
    'Private preview reviewed',
    'Visible facts and sources reviewed',
    'CTA and verified contact path reviewed',
    'Desktop + mobile screenshots reviewed',
    'Concept disclosure / noindex reviewed',
  ]) {
    await page.getByRole('checkbox', { name: label }).check();
  }
  await expect(approve).toBeEnabled();
  await page.getByLabel('Sales QA note').fill('Reviewed by the operator.');
  await approve.click();
  await expect(page.getByText(/Sales QA APPROVED/u)).toBeVisible();

  expect(postedDecision).not.toBeNull();
  expect(postedDecision?.decision).toBe('APPROVED');
  expect(postedDecision?.checklist).toEqual({
    previewReviewed: true,
    factsReviewed: true,
    ctaReviewed: true,
    screenshotsReviewed: true,
    disclosureReviewed: true,
  });
});

test('operator can inspect evidence, resolve a review issue with a note, and rerun Fact QA', async ({ page }) => {
  let prospectState = 'FACT_QA_PENDING';
  let issueStatus: 'OPEN' | 'RESOLVED' = 'OPEN';
  let resolutionPayload: Record<string, unknown> | null = null;
  await mockCommonPhase19(page, () => prospectState);
  await page.route('**/mock-api/api/v1/automated-demo/phase19/review-queue', async (route) => {
    const inspection = evidenceInspection(prospectState, issueStatus);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ issues: issueStatus === 'OPEN' ? inspection.factQa?.issues ?? [] : [] }),
    });
  });
  await page.route('**/mock-api/api/v1/automated-demo/phase19/demos/demo_phase19/evidence', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(evidenceInspection(prospectState, issueStatus)) });
  });
  await page.route('**/mock-api/api/v1/automated-demo/phase19/issues/issue_stale_city/resolve', async (route) => {
    resolutionPayload = route.request().postDataJSON() as Record<string, unknown>;
    issueStatus = 'RESOLVED';
    const issue = evidenceInspection(prospectState, issueStatus).factQa?.issues[0];
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ issue }) });
  });
  await page.route('**/mock-api/api/v1/automated-demo/phase19/demos/demo_phase19/fact-qa/run', async (route) => {
    prospectState = 'SALES_QA_PENDING';
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ result: { status: 'PASS', nextState: 'SALES_QA_PENDING' }, publicReleaseAvailable: false }),
    });
  });

  await page.goto('/qa');
  await expect(page.getByText('STALE_EVIDENCE_REVIEW').first()).toBeVisible();
  await page.getByLabel('Resolution note for STALE_EVIDENCE_REVIEW').fill('Official source was checked and refreshed.');
  await page.getByRole('button', { name: 'Mark resolved' }).click();
  await expect(page.getByText(/marked resolved/u)).toBeVisible();
  expect(resolutionPayload).toEqual({ action: 'RESOLVED', note: 'Official source was checked and refreshed.' });

  await page.getByRole('button', { name: 'Run Fact QA' }).click();
  await expect(page.getByText(/Fact QA PASS/u)).toBeVisible();
  await expect(page.getByText('Sales approval').first()).toBeVisible();
});
