import { healthLogger } from "@app/lib/api/llm/health/logger";
import type { ModelHealthWindowType } from "@app/lib/api/llm/health/types";
import type { DegradedModelEndpointType } from "@app/lib/model_constructors/types/degradations";
import { statsDMetrics } from "@app/lib/utils/statsd";

export type ModelHealthTransitionType =
  | "degraded"
  | "recovered"
  | "probe_failed";

/** Logs and counts each breaker state transition. */
export function logModelHealthTransition({
  endpoint,
  transition,
  window,
  degradedForMs,
  expiresAt,
  cleared,
}: {
  endpoint: DegradedModelEndpointType;
  transition: ModelHealthTransitionType;
  window?: ModelHealthWindowType;
  degradedForMs?: number;
  expiresAt?: Date;
  cleared?: boolean;
}): void {
  const { modelId, providerId, host } = endpoint;

  healthLogger.info(
    {
      modelId,
      providerId,
      // `host` is reserved by our log infrastructure, so the endpoint's host
      // goes out under a name of our own.
      modelHost: host,
      degradationSource: "automatic",
      transition,
      ...(expiresAt
        ? { automaticDegradationExpiresAt: expiresAt.toISOString() }
        : {}),
      ...(cleared !== undefined
        ? { automaticDegradationCleared: cleared }
        : {}),
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
    "source:automatic",
  ]);
}
