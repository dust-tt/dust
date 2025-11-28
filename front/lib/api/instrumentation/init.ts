import { NodeSDK } from "@opentelemetry/sdk-node";

import config from "@app/lib/api/config";
import { FilteredLangfuseSpanProcessor } from "@app/lib/api/instrumentation/processor";
import logger from "@app/logger/logger";
import { normalizeError } from "@app/types";

let sdk: NodeSDK | null = null;

/**
 * Initialize OpenTelemetry with Langfuse instrumentation.
 * This sets up manual tracing for LLM and agent operations only.
 */
export function initializeLangfuseInstrumentation(): void {
  if (!config.isLangfuseEnabled() || sdk) {
    return;
  }

  try {
    sdk = new NodeSDK({
      spanProcessors: [new FilteredLangfuseSpanProcessor()],
      // Disable auto-instrumentation to avoid capturing all API calls.
      instrumentations: [],
      autoDetectResources: false,
    });

    sdk.start();
  } catch (error) {
    logger.warn(
      {
        error: normalizeError(error),
      },
      "Failed to initialize Langfuse instrumentation:"
    );
  }
}
