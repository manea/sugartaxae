function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = sortKeys((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

export function canonicalizeDossierPayload(payload: unknown): string {
  return JSON.stringify(sortKeys(payload));
}

export async function computePayloadDigest(canonicalText: string): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalText);
  const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function computeDossierSha256(payload: unknown): Promise<string> {
  return computePayloadDigest(canonicalizeDossierPayload(payload));
}
