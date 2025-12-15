import { LangfuseSpanProcessor } from "@langfuse/otel";
import type { Context } from "@opentelemetry/api";
import type { ReadableSpan, Span } from "@opentelemetry/sdk-trace-base";

/**
 * Filtered Langfuse Span Processor
 *
 * Problem: LangfuseSpanProcessor captures ALL OpenTelemetry spans by default,
 * including Next.js routes, HTTP requests, etc., polluting the Langfuse UI.
 *
 * Solution: Only process spans from our manual Langfuse traces.
 * All auto-instrumentation spans are silently ignored.
 */
export class FilteredLangfuseSpanProcessor extends LangfuseSpanProcessor {
  private allowedWorkersScopes = new Set([
    "langfuse-sdk", // Expected scope name from @langfuse/tracing.
    "@temporalio/interceptor-activity", // Expected scope name for Temporal activities.
  ]);

  private shouldProcessSpan(span: ReadableSpan): boolean {
    const { name } = span;
    const scopeName = span.instrumentationScope?.name;

    if (this.allowedWorkersScopes.has(scopeName)) {
      return true;
    }

    // For Temporal client, we only want to capture agent loop workflow spans.
    if (
      name === "StartWorkflow:agentLoopWorkflow" &&
      scopeName === "@temporalio/interceptor-client"
    ) {
      return true;
    }

    return false;
  }

  onStart(span: Span, parentContext: Context): void {
    if (this.shouldProcessSpan(span)) {
      super.onStart(span, parentContext);
    }
  }

  onEnd(span: ReadableSpan): void {
    if (this.shouldProcessSpan(span)) {
      super.onEnd(span);
    }
  }
}
