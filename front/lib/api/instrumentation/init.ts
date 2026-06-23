import config from "@app/lib/api/config";
import { FilteredLangfuseSpanProcessor } from "@app/lib/api/instrumentation/processor";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { configureGlobalLogger, LogLevel } from "@langfuse/core";
import type { Resource } from "@opentelemetry/resources";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { NoopSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";

let sdk: NodeSDK | undefined;
export let resource: Resource | undefined;

/**
 * Initialize OpenTelemetry instrumentation.
 *
 * This always registers a TracerProvider and an AsyncLocalStorageContextManager
 * (via NodeSDK) so the active span propagates through async contexts. That
 * propagation is what lets `SequelizeWithComments` read the current route/method
 * from the active span and tag SQL queries for Cloud SQL Query Insights (both in
 * Next.js `front` and in the Hono `front-api`).
 *
 * The Langfuse span exporter is only attached when Langfuse is enabled (for
 * LLM/agent observability). Otherwise a NoopSpanProcessor keeps the provider
 * registered without exporting anything.
 */
export function initializeOpenTelemetryInstrumentation({
  serviceName,
}: {
  serviceName:
    | "dust-agent-loop"
    | "dust-front"
    | "dust-front-api"
    | "dust-reinforcement"
    | "dust-project-todo";
}): void {
  if (sdk) {
    return;
  }

  const langfuseEnabled = config.isLangfuseEnabled();

  try {
    if (langfuseEnabled) {
      // Suppress noisy "[Langfuse SDK] [WARN] No active OTEL span in context" warnings.
      configureGlobalLogger({ level: LogLevel.ERROR });
    }

    resource = resourceFromAttributes({
      [ATTR_SERVICE_NAME]: serviceName,
    });

    sdk = new NodeSDK({
      autoDetectResources: false,
      // Disable auto-instrumentation to avoid capturing all API calls.
      instrumentations: [],
      resource,
      spanProcessors: langfuseEnabled
        ? [new FilteredLangfuseSpanProcessor()]
        : [new NoopSpanProcessor()],
    });

    sdk.start();
  } catch (error) {
    // Use console.warn as this code is called in a specific context in Next.js.
    console.warn(
      {
        error: normalizeError(error),
      },
      "Failed to initialize OpenTelemetry instrumentation:"
    );
  }
}
