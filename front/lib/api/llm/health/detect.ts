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

export function isBreaching(window: ModelHealthWindowType): boolean {
  if (window.attempts < MIN_ATTEMPTS_IN_WINDOW) {
    return false;
  }

  return window.providerErrors / window.attempts >= ERROR_RATIO_THRESHOLD;
}

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

  if (launchRes.value === "started") {
    logModelHealthTransition({ endpoint, transition: "degraded", window });
  }
}
