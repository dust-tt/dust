import type { ProviderId } from "@app/lib/model_constructors/types/provider_ids";

/**
 * Known-intentional differences between the legacy router and the new
 * model-router request payloads. `normalize` subtracts these so a strict
 * `toEqual` only fails on *unexpected* divergence. Every subtraction is a
 * deliberate product decision documented inline — add a new entry only after
 * confirming the diff is intentional (not a regression in the new router).
 */
type Normalizer = (request: Record<string, unknown>) => Record<string, unknown>;

function isObjectLike(v: unknown): v is Record<string, unknown> | unknown[] {
  return typeof v === "object" && v !== null;
}

// Recursively drops own properties whose value is `undefined`. These serialize
// away in the actual HTTP body (JSON.stringify omits them), so an
// `output_config: undefined` on one side and an omitted key on the other are
// the same wire bytes — not a real difference.
function dropUndefined(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(dropUndefined);
  }
  if (isObjectLike(value)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (v !== undefined) {
        out[k] = dropUndefined(v);
      }
    }
    return out;
  }
  return value;
}

function clone(request: unknown): Record<string, unknown> {
  const cleaned = dropUndefined(structuredClone(request));
  // Provider requests are always objects; an array/primitive here is a bug.
  return isObjectLike(cleaned) && !Array.isArray(cleaned) ? cleaned : {};
}

const anthropicNormalizer: Normalizer = (request) => {
  const r = clone(request);

  // Server-side fallback is a legacy-only beta feature; the new router does not
  // (yet) emit `fallbacks` nor the accompanying `betas` header param.
  delete r.betas;
  delete r.fallbacks;

  return r;
};

const NORMALIZERS: Partial<Record<ProviderId, Normalizer>> = {
  anthropic: anthropicNormalizer,
};

export function normalizeRequest(
  providerId: ProviderId,
  request: unknown
): Record<string, unknown> {
  const normalizer = NORMALIZERS[providerId];
  if (!normalizer) {
    return clone(request);
  }
  return normalizer(clone(request));
}
