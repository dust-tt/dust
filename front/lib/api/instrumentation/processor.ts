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
  private allowedScopes = new Set([
    "langfuse-sdk", // Expected scope name from @langfuse/tracing
  ]);

  private shouldProcessSpan(span: ReadableSpan): boolean {
    const scopeName = span.instrumentationScope?.name;
    return scopeName ? this.allowedScopes.has(scopeName) : false;
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
