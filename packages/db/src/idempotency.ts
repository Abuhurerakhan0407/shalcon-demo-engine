const FNV_OFFSET = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const MASK_64 = 0xffffffffffffffffn;

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(',')}]`;
  }

  const object = value as Record<string, unknown>;
  const entries = Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableSerialize(object[key])}`);
  return `{${entries.join(',')}}`;
}

function fnv1a64(input: string): string {
  let hash = FNV_OFFSET;
  for (const char of input) {
    hash ^= BigInt(char.codePointAt(0) ?? 0);
    hash = (hash * FNV_PRIME) & MASK_64;
  }
  return hash.toString(16).padStart(16, '0');
}

export interface IdempotencyInput {
  namespace: string;
  action: string;
  entityId: string;
  version?: string;
  payload?: unknown;
}

export function buildIdempotencyKey(input: IdempotencyInput): string {
  const namespace = input.namespace.trim().toLowerCase();
  const action = input.action.trim().toLowerCase();
  const entityId = input.entityId.trim();
  const version = input.version?.trim() || 'v1';

  if (!namespace || !action || !entityId) {
    throw new Error('Idempotency namespace, action, and entityId are required.');
  }

  const canonical = stableSerialize({
    action,
    entityId,
    namespace,
    payload: input.payload ?? null,
    version,
  });

  return `${namespace}:${action}:${fnv1a64(canonical)}`;
}
