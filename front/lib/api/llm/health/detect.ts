import {
  ERROR_RATIO_THRESHOLD,
  MIN_ATTEMPTS_IN_WINDOW,
} from "@app/lib/api/llm/health/config";
import { healthLogger } from "@app/lib/api/llm/health/logger";
import { logModelHealthTransition } from "@app/lib/api/llm/health/transitions";
import type { ModelHealthWindowType } from "@app/lib/api/llm/health/types";
import { readEndpointWindow } from "@app/lib/api/llm/health/window";
import type { DegradedModelEndpointType } from "@app/lib/model_constructors/types/degradations";
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
  now: Date = new Date()
): Promise<EndpointEvaluationType> {
  const window = await readEndpointWindow(endpoint, now);
  if (!isBreaching(window)) {
    return { outcome: "not_breaching" };
  }

  const launchRes = await launchModelHealthRecovery(endpoint);
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

  switch (launchRes.value.outcome) {
    case "started":
      logModelHealthTransition({ endpoint, transition: "degraded", window });
      return {
        outcome: "recovery_started",
        degradedSinceMs: launchRes.value.degradedSinceMs,
      };

    case "already_degraded":
      // Not a state change: another pod already logged the transition.
      return launchRes.value;

    default:
      assertNever(launchRes.value);
  }
}
