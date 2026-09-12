import { describe, expect, it } from 'vitest';

import {
  SHALCON_TEMPLATE_ASSET_LIBRARY,
  planOptimizedDimensions,
  selectAssetAssignments,
} from './asset-engine';

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 'asset_logo',
    prospect_id: 'p_asset',
    asset_type: 'LOGO',
    source_type: 'OFFICIAL_WEBSITE',
    source_url: 'https://salon.example/logo.png',
    storage_ref: 'r2://prospects/p_asset/logo.png',
    usage_classification: 'PROSPECT_OFFICIAL',
    mime_type: 'image/png',
    width: 1024,
    height: 512,
    source_captured_at: '2026-09-12T00:00:00.000Z',
    association_assumption: 'OFFICIAL_PROSPECT_SOURCE',
    watermark_status: 'CLEAR',
    asset_status: 'ACTIVE',
    created_at: '2026-09-12T00:00:00.000Z',
    ...overrides,
  } as Parameters<typeof selectAssetAssignments>[3][number];
}

describe('Phase 16 asset engine', () => {
  it('prefers a fully sourced official prospect logo and keeps template imagery generic', () => {
    const selection = selectAssetAssignments('Élane Salon', 'elane-v8', '8.0.0', [row()]);
    const logo = selection.assignments[0];
    expect(logo?.kind).toBe('IMAGE');
    if (logo?.kind !== 'IMAGE') throw new Error('Expected official logo.');
    expect(logo.usageClassification).toBe('PROSPECT_OFFICIAL');
    expect(logo.sourceUrl).toBe('https://salon.example/logo.png');
    expect(logo.sourceCapturedAt).toBeTruthy();
    expect(logo.associationAssumption).toBe('OFFICIAL_PROSPECT_SOURCE');
    expect(selection.assignments.slice(1).every((asset) =>
      asset.kind === 'IMAGE' && asset.representation === 'GENERIC_TEMPLATE_IMAGERY' && asset.mayDescribeAsProspectReality === false,
    )).toBe(true);
  });

  it('rejects random, watermarked, broken, or provenance-incomplete external assets', () => {
    const selection = selectAssetAssignments('Élane Salon', 'elane-v8', '8.0.0', [
      row({ id: 'random', source_type: 'GENERAL_DIRECTORY', usage_classification: 'UNVERIFIED_EXTERNAL' }),
      row({ id: 'watermarked', watermark_status: 'WATERMARKED' }),
      row({ id: 'broken', asset_status: 'BROKEN' }),
      row({ id: 'missing-source', source_url: null }),
    ]);
    expect(selection.rejectedExternalAssetIds).toEqual(expect.arrayContaining(['random', 'watermarked', 'broken', 'missing-source']));
    expect(selection.assignments.some((asset) => asset.kind === 'IMAGE' && ['random', 'watermarked', 'broken', 'missing-source'].includes(asset.assetId))).toBe(false);
  });

  it('uses a text wordmark when no eligible official logo exists', () => {
    const selection = selectAssetAssignments('A Long but Valid Salon Name', 'elane-v8', '8.0.0', []);
    expect(selection.assignments[0]).toMatchObject({
      slot: 'LOGO',
      kind: 'TEXT_WORDMARK',
      text: 'A Long but Valid Salon Name',
      usageClassification: 'TEXT_WORDMARK_FALLBACK',
    });
  });

  it('keeps the Shalcon template library clear of watermarks and prospect-reality claims', () => {
    expect(SHALCON_TEMPLATE_ASSET_LIBRARY.length).toBeGreaterThanOrEqual(3);
    expect(SHALCON_TEMPLATE_ASSET_LIBRARY.every((asset) => asset.watermarked === false)).toBe(true);
    expect(SHALCON_TEMPLATE_ASSET_LIBRARY.every((asset) => asset.representation === 'GENERIC_TEMPLATE_IMAGERY')).toBe(true);
  });

  it('plans bounded image dimensions without upscaling or changing aspect ratio materially', () => {
    expect(planOptimizedDimensions(2400, 1200, 1200, 1200)).toEqual({
      sourceWidth: 2400,
      sourceHeight: 1200,
      outputWidth: 1200,
      outputHeight: 600,
      resizeRequired: true,
    });
    expect(planOptimizedDimensions(400, 300, 1200, 1200)).toEqual({
      sourceWidth: 400,
      sourceHeight: 300,
      outputWidth: 400,
      outputHeight: 300,
      resizeRequired: false,
    });
  });
});
