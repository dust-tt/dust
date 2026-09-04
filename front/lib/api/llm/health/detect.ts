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
import { normalizeError } from "@app/types/shared/utils/error_utils";

/**
 * An endpoint is degraded when enough attempts landed in the window and the
 * share attributed to the provider crossed the threshold. The volume floor is
 * what keeps a handful of failures on a low-traffic endpoint from tripping it.
 */
export function isBreaching(window: ModelHealthWindowType): boolean {
  if (window.attempts < MIN_ATTEMPTS_IN_WINDOW) {
    return false;
  }

  return window.providerErrors / window.attempts >= ERROR_RATIO_THRESHOLD;
}

/**
 * Reads one endpoint's window and declares it degraded if it is breaching.
 *
 * Runs on the pod that just served the endpoint, right after it wrote its
 * counter, so only the endpoint in hand is ever read -- never a sweep of the
 * catalog. Several pods can reach the same conclusion at the same instant,
 * which is fine: starting the recovery workflow is idempotent, and its
 * deterministic workflow id is what makes it so.
 *
 * There is no state to consult first. In this phase a running recovery workflow
 * *is* the degraded state, so re-declaring an endpoint that is already degraded
 * costs one rejected start and nothing else.
 */
export async function evaluateEndpoint(
  endpoint: DegradedModelEndpointType,
  now: Date = new Date()
): Promise<void> {
  const window = await readEndpointWindow(endpoint, now);
  if (!isBreaching(window)) {
    return;
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
    return;
  }

  // Only a launch that actually created the workflow is a transition: a
  // rejected duplicate means the endpoint was already degraded.
  if (launchRes.value === "started") {
    logModelHealthTransition({ endpoint, transition: "degraded", window });
  }
}
