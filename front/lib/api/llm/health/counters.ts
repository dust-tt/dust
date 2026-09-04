import {
  COUNTER_KEY_TTL_SECONDS,
  MIN_EVALUATION_INTERVAL_MS,
} from "@app/lib/api/llm/health/config";
import { evaluateEndpoint } from "@app/lib/api/llm/health/detect";
import {
  ATTEMPTS_FIELD,
  minuteBucket,
  modelHealthKey,
  PROVIDER_ERRORS_FIELD,
} from "@app/lib/api/llm/health/keys";
import type { LLMAttemptOutcomeTelemetry } from "@app/lib/api/llm/telemetry";
import { runOnRedisCache } from "@app/lib/api/redis";
import type { DegradedModelEndpointType } from "@app/lib/model_constructors/types/degradations";
import { degradedModelEndpointKey } from "@app/lib/model_constructors/types/degradations";
import { NOOP_HOST } from "@app/lib/model_constructors/types/hosts";
import { statsDMetrics } from "@app/lib/utils/statsd";

// One entry per endpoint, so bounded by the endpoint catalog.
const lastEvaluatedAtMs = new Map<string, number>();

function isEvaluationDue(
  endpoint: DegradedModelEndpointType,
  now: Date
): boolean {
  const key = degradedModelEndpointKey(endpoint);
  const previousMs = lastEvaluatedAtMs.get(key);

  if (
    previousMs !== undefined &&
    now.getTime() - previousMs < MIN_EVALUATION_INTERVAL_MS
  ) {
    return false;
  }

  lastEvaluatedAtMs.set(key, now.getTime());

  return true;
}

/**
 * Records one model call attempt at its terminal outcome.
 *
 * Fire and forget: callers `void` this, so the request path never waits on
 * Redis and never fails with it. `HINCRBY` is additive, so N pods need no
 * coordination and no read-modify-write.
 *
 * Dropping writes is acceptable by design. The threshold is a share of hundreds
 * of attempts over five minutes, so a handful of lost increments cannot change
 * the verdict -- which is why nothing here retries, batches or blocks.
 *
 * An error write is also what triggers detection for that endpoint, throttled to
 * `MIN_EVALUATION_INTERVAL_MS`.
 *
 * Only provider-attributed errors count towards the numerator. That is exactly
 * the `error_source:provider` filter the existing Datadog monitor applies at
 * query time to `llm_error.count`.
 */
export async function recordLLMAttempt({
  endpoint,
  outcome,
  now = new Date(),
}: {
  endpoint: DegradedModelEndpointType;
  outcome: LLMAttemptOutcomeTelemetry;
  now?: Date;
}): Promise<void> {
  // The noop model is a test fixture, not an endpoint anyone can be degraded on.
  if (endpoint.host === NOOP_HOST) {
    return;
  }

  const key = modelHealthKey(endpoint, minuteBucket(now));
  const isProviderError =
    outcome.outcome === "error" && outcome.errorSource === "provider";

  try {
    await runOnRedisCache({ origin: "model_health" }, async (client) => {
      const multi = client.multi();

      multi.hIncrBy(key, ATTEMPTS_FIELD, 1);
      if (isProviderError) {
        multi.hIncrBy(key, PROVIDER_ERRORS_FIELD, 1);
      }
      // Refreshed on every write, so a bucket outlives its last attempt by the
      // TTL rather than by its own age.
      multi.expire(key, COUNTER_KEY_TTL_SECONDS);

      await multi.exec();
    });

    // Only an error can push the ratio over the threshold, so a successful
    // attempt has nothing to detect. This reads back the window for this one
    // endpoint -- the one we just served -- and never for any other.
    if (isProviderError && isEvaluationDue(endpoint, now)) {
      await evaluateEndpoint(endpoint, now);
    }
  } catch {
    // Counted rather than logged: this runs once per attempt, so a Redis outage
    // would put one line per attempt in the logs. The connection error itself is
    // already logged once by the client's `error` handler in `lib/api/redis`.
    statsDMetrics.increment("model_health.write_error.count", 1);
  }
}
