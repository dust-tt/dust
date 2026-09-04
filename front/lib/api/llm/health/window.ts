import {
  ATTEMPTS_FIELD,
  modelHealthKey,
  PROVIDER_ERRORS_FIELD,
  windowMinuteBuckets,
} from "@app/lib/api/llm/health/keys";
import type { ModelHealthWindowType } from "@app/lib/api/llm/health/types";
import { runOnRedisCache } from "@app/lib/api/redis";
import type { DegradedModelEndpointType } from "@app/lib/model_constructors/types/degradations";

// `multi().hGetAll()` is typed as a raw reply, so narrow it rather than casting
// it: an unexpected shape must be skipped, not coerced.
function isStringRecord(value: unknown): value is Record<string, string> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every((entry) => typeof entry === "string")
  );
}

function emptyWindow(): ModelHealthWindowType {
  return { attempts: 0, providerErrors: 0 };
}

function addHashToWindow(
  window: ModelHealthWindowType,
  hash: Record<string, string>
): ModelHealthWindowType {
  let { attempts, providerErrors } = window;

  for (const [field, rawValue] of Object.entries(hash)) {
    const value = Number(rawValue);
    if (!Number.isFinite(value)) {
      continue;
    }

    if (field === ATTEMPTS_FIELD) {
      attempts += value;
    } else if (field === PROVIDER_ERRORS_FIELD) {
      providerErrors += value;
    }
  }

  return { attempts, providerErrors };
}

/**
 * Sums one endpoint's counters over the `WINDOW_MINUTES` buckets ending at
 * `now`, inclusive. One `hGetAll` per bucket, pipelined into a single round
 * trip; buckets with no traffic simply contribute nothing.
 *
 * The current minute is included even though it is still being written to: a
 * partial bucket contributes to both sides of the ratio, and leaving it out
 * would cost a minute of detection latency for nothing.
 */
export async function readEndpointWindow(
  endpoint: DegradedModelEndpointType,
  now: Date
): Promise<ModelHealthWindowType> {
  return runOnRedisCache({ origin: "model_health" }, async (client) => {
    const pipeline = client.multi();
    for (const bucket of windowMinuteBuckets(now)) {
      pipeline.hGetAll(modelHealthKey(endpoint, bucket));
    }

    let window = emptyWindow();
    for (const reply of await pipeline.exec()) {
      if (isStringRecord(reply)) {
        window = addHashToWindow(window, reply);
      }
    }

    return window;
  });
}
