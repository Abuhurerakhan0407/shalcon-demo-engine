import { type DemoRecord } from '@shalcon/db';
import {
  ELANE_V8_DOCUMENT_SOURCE,
  renderElaneDocument,
  validateSalonTemplateConfig,
} from '@shalcon/template-runtime';
import { findTemplateDefinition } from '@shalcon/templates';

const PUBLIC_DEMO_STATUSES = new Set<DemoRecord['status']>(['READY', 'SENT', 'CONVERTED']);
const DEMO_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,128}$/u;
type SalonTemplateConfig = Parameters<typeof validateSalonTemplateConfig>[0];

export type DemoRenderResult =
  | { ok: true; html: string; demoId: string }
  | { ok: false; reason: 'UNAVAILABLE' | 'INVALID_CONFIG' | 'UNKNOWN_TEMPLATE' };

function toHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function isValidDemoToken(token: string): boolean {
  return DEMO_TOKEN_PATTERN.test(token);
}

export async function hashDemoToken(token: string): Promise<string> {
  return toHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)));
}

export function isDemoPubliclyAvailable(demo: DemoRecord, nowIso: string): boolean {
  if (!PUBLIC_DEMO_STATUSES.has(demo.status)) return false;
  if (!demo.expiresAt) return true;
  return Date.parse(demo.expiresAt) > Date.parse(nowIso);
}

function parseConfig(configJson: string): unknown {
  try {
    return JSON.parse(configJson) as unknown;
  } catch {
    return null;
  }
}

export function renderDemoRecord(demo: DemoRecord, nowIso: string): DemoRenderResult {
  if (!isDemoPubliclyAvailable(demo, nowIso)) return { ok: false, reason: 'UNAVAILABLE' };

  const template = findTemplateDefinition(demo.templateId, demo.templateVersion);
  if (!template || template.id !== 'elane-v8' || template.version !== '8.0.0') {
    return { ok: false, reason: 'UNKNOWN_TEMPLATE' };
  }

  const config = parseConfig(demo.configJson);
  if (!config) return { ok: false, reason: 'INVALID_CONFIG' };
  const typedConfig = config as SalonTemplateConfig;
  const validation = validateSalonTemplateConfig(typedConfig);
  if (!validation.ok) return { ok: false, reason: 'INVALID_CONFIG' };

  try {
    return {
      ok: true,
      html: renderElaneDocument(ELANE_V8_DOCUMENT_SOURCE, typedConfig),
      demoId: demo.id,
    };
  } catch {
    return { ok: false, reason: 'INVALID_CONFIG' };
  }
}
