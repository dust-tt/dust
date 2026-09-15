import { MIN_DEGRADED_DURATION_MS } from "@app/lib/api/llm/health/config";
import { runOnRedisCache } from "@app/lib/api/redis";
import type { DegradedModelEndpointType } from "@app/lib/model_constructors/types/degradations";
import { degradedModelEndpointKey } from "@app/lib/model_constructors/types/degradations";

const AUTOMATIC_DEGRADATIONS_KEY = "mh:automatic_degradations";
const CACHE_REFRESH_INTERVAL_MS = 60 * 1000;

// A failed probe refreshes the lease every MIN_DEGRADED_DURATION_MS. Keeping
// twice that interval lets one delayed activity finish without routing an
// unhealthy model again, while still self-healing if a workflow dies.
const AUTOMATIC_DEGRADATION_LEASE_MS = MIN_DEGRADED_DURATION_MS * 2;

type AutomaticDegradationValue = {
  modelId: string;
  expiresAtMs: number;
};

let cachedModelIds: ReadonlySet<string> = new Set();
let lastRefreshStartedAtMs = 0;
let refreshPromise: Promise<void> | null = null;
let cacheRevision = 0;

function parseValue(raw: string): AutomaticDegradationValue | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (
      typeof value === "object" &&
      value !== null &&
      "modelId" in value &&
      typeof value.modelId === "string" &&
      "expiresAtMs" in value &&
      typeof value.expiresAtMs === "number"
    ) {
      return value as AutomaticDegradationValue;
    }
  } catch {
    // Invalid cache values are treated as expired and removed below.
  }
  return null;
}

async function readActiveModelIds(nowMs: number): Promise<ReadonlySet<string>> {
  return runOnRedisCache({ origin: "model_health" }, async (redis) => {
    const values = await redis.hGetAll(AUTOMATIC_DEGRADATIONS_KEY);
    const activeModelIds = new Set<string>();
    const staleFields: string[] = [];

    for (const [field, raw] of Object.entries(values)) {
      const value = parseValue(raw);
      if (!value || value.expiresAtMs <= nowMs) {
        staleFields.push(field);
      } else {
        activeModelIds.add(value.modelId);
      }
    }

    if (staleFields.length > 0) {
      await redis.hDel(AUTOMATIC_DEGRADATIONS_KEY, staleFields);
    }

    return activeModelIds;
  });
}

function startRefresh(nowMs: number): Promise<void> {
  lastRefreshStartedAtMs = nowMs;
  const revisionAtStart = cacheRevision;
  refreshPromise = readActiveModelIds(nowMs)
    .then((modelIds) => {
      if (revisionAtStart === cacheRevision) {
        cachedModelIds = modelIds;
      }
    })
    .finally(() => {
      refreshPromise = null;
    });

  return refreshPromise;
}

/**
 * @cc [owner:frankaloia,label:product;error-handling] automatic-degradation-routing-state
 * Automatic degradation MUST remain separate from operator-managed degradation, MUST expire if
 * recovery stops refreshing it, and MUST collapse concurrent endpoint degradations to model IDs
 * without clearing a model while another endpoint for that model remains degraded.
 */
export async function markModelAutomaticallyDegraded(
  endpoint: DegradedModelEndpointType,
  nowMs: number = Date.now()
): Promise<void> {
  await runOnRedisCache({ origin: "model_health" }, (redis) =>
    redis.hSet(
      AUTOMATIC_DEGRADATIONS_KEY,
      degradedModelEndpointKey(endpoint),
      JSON.stringify({
        modelId: endpoint.modelId,
        expiresAtMs: nowMs + AUTOMATIC_DEGRADATION_LEASE_MS,
      } satisfies AutomaticDegradationValue)
    )
  );

  cachedModelIds = new Set([...cachedModelIds, endpoint.modelId]);
  cacheRevision += 1;
  lastRefreshStartedAtMs = nowMs;
}

export async function clearAutomaticModelDegradation(
  endpoint: DegradedModelEndpointType,
  nowMs: number = Date.now()
): Promise<void> {
  await runOnRedisCache({ origin: "model_health" }, (redis) =>
    redis.hDel(AUTOMATIC_DEGRADATIONS_KEY, degradedModelEndpointKey(endpoint))
  );

  // Re-read instead of deleting the model locally: another endpoint serving
  // the same model may still have an active recovery workflow.
  cacheRevision += 1;
  if (refreshPromise) {
    await refreshPromise;
  }
  await startRefresh(nowMs);
}

export async function refreshAutomaticallyDegradedModelIds(
  nowMs: number = Date.now()
): Promise<ReadonlySet<string>> {
  if (refreshPromise) {
    await refreshPromise;
  }
  await startRefresh(nowMs);
  return cachedModelIds;
}

export function getAutomaticallyDegradedModelIds(): ReadonlySet<string> {
  const nowMs = Date.now();
  if (
    !refreshPromise &&
    nowMs - lastRefreshStartedAtMs > CACHE_REFRESH_INTERVAL_MS
  ) {
    void startRefresh(nowMs);
  }
  return cachedModelIds;
}

export async function isModelEndpointAutomaticallyDegraded(
  endpoint: DegradedModelEndpointType,
  nowMs: number = Date.now()
): Promise<boolean> {
  const values = await runOnRedisCache({ origin: "model_health" }, (redis) =>
    redis.hGetAll(AUTOMATIC_DEGRADATIONS_KEY)
  );
  const value = parseValue(values[degradedModelEndpointKey(endpoint)] ?? "");
  return value !== null && value.expiresAtMs > nowMs;
}
