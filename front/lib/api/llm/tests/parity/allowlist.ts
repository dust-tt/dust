import type { ProviderId } from "@app/lib/model_constructors/types/provider_ids";
import { isRecord } from "@app/types/shared/utils/general";

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

function stripCacheControlTtl(value: unknown): void {
  if (Array.isArray(value)) {
    value.forEach(stripCacheControlTtl);
    return;
  }
  if (isObjectLike(value) && isRecord(value)) {
    const cacheControl = value.cache_control;
    if (isObjectLike(cacheControl) && isRecord(cacheControl)) {
      delete cacheControl.ttl;
    }
    for (const v of Object.values(value)) {
      stripCacheControlTtl(v);
    }
  }
}

function stripMessageCacheControl(messages: unknown): void {
  if (!Array.isArray(messages)) {
    return;
  }
  for (const message of messages) {
    if (
      isObjectLike(message) &&
      isRecord(message) &&
      Array.isArray(message.content)
    ) {
      for (const block of message.content) {
        if (isObjectLike(block) && isRecord(block)) {
          delete block.cache_control;
        }
      }
    }
  }
}

function toolResultBlockToString(messages: unknown): void {
  if (!Array.isArray(messages)) {
    return;
  }
  for (const message of messages) {
    if (
      !isObjectLike(message) ||
      !isRecord(message) ||
      !Array.isArray(message.content)
    ) {
      continue;
    }
    for (const block of message.content) {
      if (
        isObjectLike(block) &&
        isRecord(block) &&
        block.type === "tool_result" &&
        Array.isArray(block.content) &&
        block.content.every(
          (b) => isObjectLike(b) && isRecord(b) && b.type === "text"
        )
      ) {
        block.content = block.content
          .map((b) => (isObjectLike(b) && isRecord(b) ? b.text : ""))
          .join("");
      }
    }
  }
}

const anthropicNormalizer: Normalizer = (request) => {
  const r = clone(request);

  // Legacy-only server-side fallback.
  delete r.betas;
  delete r.fallbacks;

  // New router also caches the latest user turn; legacy caches only the system.
  stripMessageCacheControl(r.messages);

  // New router sets an explicit ttl:"5m"; legacy relies on the implicit default.
  stripCacheControlTtl(r);

  // New router sends tool_result content as a text-block array, legacy a string.
  toolResultBlockToString(r.messages);

  // Reasoning/temperature mapping differs by design (adaptive vs extended
  // thinking, light->minimal vs disabled, temperature passthrough when thinking
  // is off); covered by the model_constructors integration tests.
  delete r.thinking;
  delete r.output_config;
  delete r.temperature;

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
