import {
  DEGRADATION_LEASE_MS,
  ERROR_RATIO_THRESHOLD,
  MIN_ATTEMPTS_IN_WINDOW,
} from "@app/lib/api/llm/health/config";
import { healthLogger } from "@app/lib/api/llm/health/logger";
import { logModelHealthTransition } from "@app/lib/api/llm/health/transitions";
import type { ModelHealthWindowType } from "@app/lib/api/llm/health/types";
import { readEndpointWindow } from "@app/lib/api/llm/health/window";
import type { Authenticator } from "@app/lib/auth";
import type { DegradedModelEndpointType } from "@app/lib/model_constructors/types/degradations";
import { ModelDegradationResource } from "@app/lib/resources/model_degradation_resource";
import { launchModelHealthRecovery } from "@app/temporal/model_health/client";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { normalizeError } from "@app/types/shared/utils/error_utils";

export function isBreaching(window: ModelHealthWindowType): boolean {
  if (window.attempts < MIN_ATTEMPTS_IN_WINDOW) {
    return false;
  }

  return window.providerErrors / window.attempts >= ERROR_RATIO_THRESHOLD;
}

/**
 * What one evaluation established.
 *
 * The two degraded outcomes carry `degradedSinceMs`, the recovery workflow's
 * start time, because that alone pins when the endpoint could next change
 * state. It is null only when the workflow is running but its start time could
 * not be read.
 */
export type EndpointEvaluationType =
  | { outcome: "not_breaching" }
  | { outcome: "recovery_started"; degradedSinceMs: number }
  | { outcome: "already_degraded"; degradedSinceMs: number | null }
  | { outcome: "launch_failed" };

export async function evaluateEndpoint(
  endpoint: DegradedModelEndpointType,
  auth: Authenticator,
  now: Date = new Date()
): Promise<EndpointEvaluationType> {
  const window = await readEndpointWindow(endpoint, now);
  if (!isBreaching(window)) {
    return { outcome: "not_breaching" };
  }

  const persistDegradation = await auth.hasFeatureFlag(
    "automatic_model_health_routing"
  );
  const launchRes = await launchModelHealthRecovery(
    endpoint,
    persistDegradation
  );
  if (launchRes.isErr()) {
    healthLogger.error(
      {
        err: normalizeError(launchRes.error),
        modelId: endpoint.modelId,
        providerId: endpoint.providerId,
        modelHost: endpoint.host,
      },
      "Failed to start the model health recovery workflow"
    );
    return { outcome: "launch_failed" };
  }

  let expiresAt: Date | undefined;
  if (persistDegradation) {
    expiresAt = new Date(now.getTime() + DEGRADATION_LEASE_MS);
    await ModelDegradationResource.updateDegradedEndpoints([
      { ...endpoint, degraded: true, expiresAt },
    ]);
  }

  switch (launchRes.value.outcome) {
    case "started": {
      logModelHealthTransition({
        endpoint,
        transition: "degraded",
        window,
        expiresAt,
      });
      return {
        outcome: "recovery_started",
        degradedSinceMs: launchRes.value.degradedSinceMs,
      };
    }

    case "already_degraded":
      // Not a state change: another pod already logged the transition.
      return launchRes.value;

    default:
      assertNever(launchRes.value);
  }
}
