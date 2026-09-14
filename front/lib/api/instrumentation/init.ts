import config from "@app/lib/api/config";
import { FilteredLangfuseSpanProcessor } from "@app/lib/api/instrumentation/processor";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { configureGlobalLogger, LogLevel } from "@langfuse/core";
import type { Resource } from "@opentelemetry/resources";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";

let provider: NodeTracerProvider | undefined;
export let resource: Resource | undefined;

/**
 * Initialize OpenTelemetry with Langfuse instrumentation for agent-loop observability.
 * This sets up manual tracing for LLM and agent operations only.
 */
export function initializeOpenTelemetryInstrumentation({
  serviceName,
}: {
  serviceName:
    | "dust-agent-loop"
    | "dust-front"
    | "dust-reinforcement"
    | "dust-project-todo";
}): void {
  if (!config.isLangfuseEnabled() || provider) {
    return;
  }

  try {
    // Suppress noisy "[Langfuse SDK] [WARN] No active OTEL span in context" warnings.
    configureGlobalLogger({ level: LogLevel.ERROR });

    resource = resourceFromAttributes({
      [ATTR_SERVICE_NAME]: serviceName,
    });

    provider = new NodeTracerProvider({
      resource,
      spanProcessors: [new FilteredLangfuseSpanProcessor()],
    });

    provider.register();
  } catch (error) {
    // Use console.warn as this code is called in a specific context in Next.js.
    console.warn(
      {
        error: normalizeError(error),
      },
      "Failed to initialize Langfuse instrumentation:"
    );
  }
}
