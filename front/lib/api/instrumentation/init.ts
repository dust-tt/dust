import type { Resource } from "@opentelemetry/resources";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";

import config from "@app/lib/api/config";
import { FilteredLangfuseSpanProcessor } from "@app/lib/api/instrumentation/processor";
import { normalizeError } from "@app/types/shared/utils/error_utils";

// Semantic convention constant inlined to avoid importing the large semantic-conventions package
const ATTR_SERVICE_NAME = "service.name";

let provider: NodeTracerProvider | undefined;
export let resource: Resource | undefined;

/**
 * Initialize OpenTelemetry with Langfuse instrumentation for agent-loop observability.
 * This sets up manual tracing for LLM and agent operations only.
 *
 * Uses NodeTracerProvider directly instead of NodeSDK to avoid bundling
 * unnecessary exporters (OTLP, Prometheus, Zipkin, etc.) that add ~1.5MB to the bundle.
 */
export function initializeOpenTelemetryInstrumentation({
  serviceName,
}: {
  serviceName: "dust-agent-loop" | "dust-front";
}): void {
  if (!config.isLangfuseEnabled() || provider) {
    return;
  }

  try {
    resource = resourceFromAttributes({
      [ATTR_SERVICE_NAME]: serviceName,
    });

    provider = new NodeTracerProvider({
      resource,
      spanProcessors: [new FilteredLangfuseSpanProcessor()],
    });

    // Register the provider globally
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
