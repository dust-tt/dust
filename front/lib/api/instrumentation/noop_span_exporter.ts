import type { ExportResult } from "@opentelemetry/core";
import { ExportResultCode } from "@opentelemetry/core";
import type { ReadableSpan, SpanExporter } from "@opentelemetry/sdk-trace-base";

/**
 * A SpanExporter that discards all spans immediately.
 *
 * Used as the Temporal workflow sink exporter: workflow-level spans from the V8
 * isolate need a sink but we don't consume them (Langfuse gets its spans
 * through the separate FilteredLangfuseSpanProcessor pipeline).
 */
export class NoopSpanExporter implements SpanExporter {
  export(
    _spans: ReadableSpan[],
    resultCallback: (result: ExportResult) => void
  ): void {
    resultCallback({ code: ExportResultCode.SUCCESS });
  }

  shutdown(): Promise<void> {
    return Promise.resolve();
  }

  forceFlush(): Promise<void> {
    return Promise.resolve();
  }
}
