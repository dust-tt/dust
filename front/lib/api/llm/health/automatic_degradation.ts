import { MIN_DEGRADED_DURATION_MS } from "@app/lib/api/llm/health/config";
import { healthLogger } from "@app/lib/api/llm/health/logger";
import type { DegradedModelEndpointType } from "@app/lib/model_constructors/types/degradations";
import { degradedModelEndpointKey } from "@app/lib/model_constructors/types/degradations";
import { ModelDegradationResource } from "@app/lib/resources/model_degradation_resource";
import { normalizeError } from "@app/types/shared/utils/error_utils";

const CACHE_REFRESH_INTERVAL_MS = 60 * 1000;

// Failed probes renew every MIN_DEGRADED_DURATION_MS. Twice that interval lets
// one delayed activity finish without routing traffic back to an unhealthy
// endpoint, while still restoring traffic if its recovery workflow dies.
const AUTOMATIC_DEGRADATION_LEASE_MS = MIN_DEGRADED_DURATION_MS * 2;

type CachedAutomaticDegradation = {
  modelId: string;
  expiresAtMs: number;
};

let cachedByEndpoint = new Map<string, CachedAutomaticDegradation>();
let lastRefreshStartedAtMs = 0;
let refreshPromise: Promise<void> | null = null;
let cacheRevision = 0;

function activeModelIds(nowMs: number): ReadonlySet<string> {
  const modelIds = new Set<string>();

  for (const value of cachedByEndpoint.values()) {
    if (value.expiresAtMs > nowMs) {
      modelIds.add(value.modelId);
    }
  }

  return modelIds;
}

async function readActiveDegradations(
  nowMs: number
): Promise<Map<string, CachedAutomaticDegradation>> {
  const records = await ModelDegradationResource.listDegradationRecords({
    source: "automatic",
    now: new Date(nowMs),
  });

  return new Map(
    records.flatMap((record) =>
      record.expiresAt
        ? [
            [
              degradedModelEndpointKey(record),
              {
                modelId: record.modelId,
                expiresAtMs: record.expiresAt.getTime(),
              },
            ] as const,
          ]
        : []
    )
  );
}

function startRefresh(nowMs: number): Promise<void> {
  lastRefreshStartedAtMs = nowMs;
  const revisionAtStart = cacheRevision;

  refreshPromise = readActiveDegradations(nowMs)
    .then((degradations) => {
      if (revisionAtStart === cacheRevision) {
        cachedByEndpoint = degradations;
      }
    })
    .catch((err) => {
      // Keep known manual-independent automatic state on a transient database
      // failure, but activeModelIds still expires each known lease on schedule.
      healthLogger.error(
        { err: normalizeError(err) },
        "Failed to refresh automatic model degradations"
      );
    })
    .finally(() => {
      refreshPromise = null;
    });

  return refreshPromise;
}

/**
 * @cc [owner:frankaloia,label:product;error-handling] automatic-degradation-routing-state
 * Automatic degradation MUST remain separate from operator-managed degradation, MUST expire if
 * recovery stops refreshing it, and MUST preserve endpoint-scoped lease generations.
 */
export async function markModelAutomaticallyDegraded(
  endpoint: DegradedModelEndpointType,
  nowMs: number = Date.now()
): Promise<Date> {
  const expiresAt = await ModelDegradationResource.renewAutomaticDegradation(
    endpoint,
    new Date(nowMs + AUTOMATIC_DEGRADATION_LEASE_MS)
  );

  cachedByEndpoint.set(degradedModelEndpointKey(endpoint), {
    modelId: endpoint.modelId,
    expiresAtMs: expiresAt.getTime(),
  });
  cacheRevision += 1;
  lastRefreshStartedAtMs = nowMs;

  return expiresAt;
}

export async function getAutomaticModelDegradationExpiresAt(
  endpoint: DegradedModelEndpointType,
  nowMs: number = Date.now()
): Promise<Date | null> {
  return ModelDegradationResource.getAutomaticDegradationExpiresAt(
    endpoint,
    new Date(nowMs)
  );
}

export async function clearAutomaticModelDegradation(
  endpoint: DegradedModelEndpointType,
  observedExpiresAt: Date
): Promise<boolean> {
  const cleared = await ModelDegradationResource.clearAutomaticDegradation(
    endpoint,
    observedExpiresAt
  );

  if (cleared) {
    cachedByEndpoint.delete(degradedModelEndpointKey(endpoint));
    cacheRevision += 1;
  }

  return cleared;
}

export async function refreshAutomaticallyDegradedModelIds(
  nowMs: number = Date.now()
): Promise<ReadonlySet<string>> {
  if (refreshPromise) {
    await refreshPromise;
  }
  await startRefresh(nowMs);
  return activeModelIds(nowMs);
}

export function getAutomaticallyDegradedModelIds(
  nowMs: number = Date.now()
): ReadonlySet<string> {
  if (
    !refreshPromise &&
    nowMs - lastRefreshStartedAtMs > CACHE_REFRESH_INTERVAL_MS
  ) {
    void startRefresh(nowMs);
  }

  return activeModelIds(nowMs);
}

export async function isModelEndpointAutomaticallyDegraded(
  endpoint: DegradedModelEndpointType,
  nowMs: number = Date.now()
): Promise<boolean> {
  return (
    (await getAutomaticModelDegradationExpiresAt(endpoint, nowMs)) !== null
  );
}
