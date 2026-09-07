import {
  ERROR_RATIO_THRESHOLD,
  MIN_ATTEMPTS_IN_WINDOW,
} from "@app/lib/api/llm/health/config";
import { logModelHealthTransition } from "@app/lib/api/llm/health/transitions";
import type { ModelHealthWindowType } from "@app/lib/api/llm/health/types";
import { readEndpointWindow } from "@app/lib/api/llm/health/window";
import type { DegradedModelEndpointType } from "@app/lib/model_constructors/types/degradations";
import logger from "@app/logger/logger";
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
 * What one evaluation established, mirroring `LaunchRecoveryOutcome` so the
 * caller can tell the two degraded outcomes apart: `recovery_started` anchors
 * the degradation at now, `already_degraded` says only that some other pod
 * anchored it at a time we cannot know.
 */
export type EndpointEvaluationType =
  | "not_breaching"
  | "recovery_started"
  | "already_degraded"
  | "launch_failed";

export async function evaluateEndpoint(
  endpoint: DegradedModelEndpointType,
  now: Date = new Date()
): Promise<EndpointEvaluationType> {
  const window = await readEndpointWindow(endpoint, now);
  if (!isBreaching(window)) {
    return "not_breaching";
  }

  const launchRes = await launchModelHealthRecovery(endpoint);
  if (launchRes.isErr()) {
    logger.error(
      {
        err: normalizeError(launchRes.error),
        modelId: endpoint.modelId,
        providerId: endpoint.providerId,
        modelHost: endpoint.host,
      },
      "Failed to start the model health recovery workflow"
    );
    return "launch_failed";
  }

  switch (launchRes.value) {
    case "started":
      logModelHealthTransition({ endpoint, transition: "degraded", window });
      return "recovery_started";

    case "already_degraded":
      // Not a state change: another pod already logged the transition.
      return "already_degraded";

    default:
      assertNever(launchRes.value);
  }
}
