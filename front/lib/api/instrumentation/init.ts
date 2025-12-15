import { trace } from "@opentelemetry/api";
import type { Resource } from "@opentelemetry/resources";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { ConsoleSpanExporter } from "@opentelemetry/sdk-trace-node";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";

import config from "@app/lib/api/config";
import { FilteredLangfuseSpanProcessor } from "@app/lib/api/instrumentation/processor";
import logger from "@app/logger/logger";
import { normalizeError } from "@app/types";

let sdk: NodeSDK | undefined;
export let resource: Resource | undefined;
export let traceExporter: ConsoleSpanExporter | undefined;

/**
 * Initialize OpenTelemetry with Langfuse instrumentation.
 * This sets up manual tracing for LLM and agent operations only.
 */
export function initializeLangfuseInstrumentation(): void {
  console.log("Initializing Langfuse instrumentation...");
  console.log("Is Langfuse enabled?", config.isLangfuseEnabled());
  console.log("Is SDK already initialized?", !!sdk);
  if (!config.isLangfuseEnabled() || sdk) {
    return;
  }

  try {
    // Create resource.
    resource = resourceFromAttributes({
      [ATTR_SERVICE_NAME]: "agent-loop",
    });

    // Create trace exporter - ConsoleSpanExporter works with Langfuse processor
    traceExporter = new ConsoleSpanExporter();

    sdk = new NodeSDK({
      resource,
      traceExporter,
      spanProcessors: [new FilteredLangfuseSpanProcessor()],
      // Disable auto-instrumentation to avoid capturing all API calls.
      instrumentations: [],
      autoDetectResources: false,
    });

    sdk.start();

    const provider = trace.getTracerProvider();
    console.log("✅ Tracer provider registered:", provider.constructor.name);

    // Test that spans can be created
    const tracer = trace.getTracer("test-tracer");
    const testSpan = tracer.startSpan("test-span");
    console.log("✅ Test span created:", testSpan);
    testSpan.end();
  } catch (error) {
    logger.warn(
      {
        error: normalizeError(error),
      },
      "Failed to initialize Langfuse instrumentation:"
    );
  }
}
