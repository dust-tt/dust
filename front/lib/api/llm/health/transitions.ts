import type { ModelHealthWindowType } from "@app/lib/api/llm/health/types";
import type { DegradedModelEndpointType } from "@app/lib/model_constructors/types/degradations";
import { statsDMetrics } from "@app/lib/utils/statsd";
import logger from "@app/logger/logger";

export type ModelHealthTransitionType =
  | "degraded"
  | "recovered"
  | "probe_failed";

/**
 * The only output of the shadow phase. Nothing is persisted, so these logs and
 * the matching Datadog series are the whole record of what the breaker would
 * have done.
 */
export function logModelHealthTransition({
  endpoint,
  transition,
  window,
  degradedForMs,
}: {
  endpoint: DegradedModelEndpointType;
  transition: ModelHealthTransitionType;
  window?: ModelHealthWindowType;
  degradedForMs?: number;
}): void {
  const { modelId, providerId, host } = endpoint;

  logger.info(
    {
      modelId,
      providerId,
      // `host` is reserved by our log infrastructure, so the endpoint's host
      // goes out under a name of our own.
      modelHost: host,
      transition,
      ...(window
        ? {
            attempts: window.attempts,
            providerErrors: window.providerErrors,
            errorRatio:
              window.attempts > 0
                ? window.providerErrors / window.attempts
                : null,
          }
        : {}),
      ...(degradedForMs !== undefined ? { degradedForMs } : {}),
    },
    "Model health transition"
  );

  statsDMetrics.increment("model_health.transition.count", 1, [
    `transition:${transition}`,
    `model_id:${modelId}`,
    `provider_id:${providerId}`,
    `model_host:${host}`,
  ]);
}
