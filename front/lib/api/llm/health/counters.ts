import {
  COUNTER_KEY_TTL_SECONDS,
  MIN_EVALUATION_INTERVAL_MS,
  nextProbeAtMs,
} from "@app/lib/api/llm/health/config";
import type { EndpointEvaluationType } from "@app/lib/api/llm/health/detect";
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
import { assertNever } from "@app/types/shared/utils/assert_never";

// How long to wait before evaluating an endpoint again, given what the last
// evaluation established. Never shorter than `MIN_EVALUATION_INTERVAL_MS`, so
// clock skew against the Temporal server can only cost a redundant look.
function holdForEvaluation(
  evaluation: EndpointEvaluationType,
  now: Date
): number {
  switch (evaluation.outcome) {
    case "recovery_started":
    case "already_degraded":
      // A running workflow can only release the endpoint at one of its probes,
      // so wait for the next one. A start time we could not read leaves nothing
      // to wait for.
      if (evaluation.degradedSinceMs === null) {
        return MIN_EVALUATION_INTERVAL_MS;
      }

      return Math.max(
        MIN_EVALUATION_INTERVAL_MS,
        nextProbeAtMs(evaluation.degradedSinceMs, now.getTime()) - now.getTime()
      );

    case "not_breaching":
    case "launch_failed":
      // Nothing is holding this endpoint -- no breach, or Temporal was
      // unreachable -- so keep looking at the usual cadence.
      return MIN_EVALUATION_INTERVAL_MS;

    default:
      assertNever(evaluation);
  }
}

// The soonest each endpoint may be evaluated again, per pod. One entry per
// endpoint, so bounded by the endpoint catalog.
const nextEvaluationAtMs = new Map<string, number>();

function holdEvaluation(
  endpoint: DegradedModelEndpointType,
  now: Date,
  forMs: number
): void {
  nextEvaluationAtMs.set(
    degradedModelEndpointKey(endpoint),
    now.getTime() + forMs
  );
}

function isEvaluationDue(
  endpoint: DegradedModelEndpointType,
  now: Date
): boolean {
  const dueAtMs = nextEvaluationAtMs.get(degradedModelEndpointKey(endpoint));

  if (dueAtMs !== undefined && now.getTime() < dueAtMs) {
    return false;
  }

  // Held before the evaluation runs, not after: two attempts on this pod can
  // interleave across the await otherwise, and both would evaluate. The outcome
  // overwrites this with its own hold.
  holdEvaluation(endpoint, now, MIN_EVALUATION_INTERVAL_MS);

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
 * An error write is also what triggers detection for that endpoint, throttled by
 * `holdForEvaluation` on what the last evaluation established.
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
      // While recovery holds the endpoint, evaluating again buys nothing: the
      // window still breaches and the start still comes back rejected. How long
      // that stays true depends on the outcome, so the hold does too.
      const evaluation = await evaluateEndpoint(endpoint, now);
      holdEvaluation(endpoint, now, holdForEvaluation(evaluation, now));
    }
  } catch {
    // Counted rather than logged: this runs once per attempt, so a Redis outage
    // would put one line per attempt in the logs. The connection error itself is
    // already logged once by the client's `error` handler in `lib/api/redis`.
    statsDMetrics.increment("model_health.write_error.count", 1);
  }
}
