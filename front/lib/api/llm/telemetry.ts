/**
 * Shared LLM attempt telemetry. Metrics and structured logs must be built from
 * the same normalized values so their dimensions cannot drift.
 */
import type { LLMErrorType } from "@app/lib/api/llm/types/errors";
import type { ErrorSource } from "@app/lib/model_constructors/types/output/events";
import { statsDMetrics } from "@app/lib/utils/statsd";
import type { ReasoningEffort } from "@app/types/assistant/models/types";
import { assertNever } from "@app/types/shared/utils/assert_never";

export type LLMTelemetrySurface = "stream" | "batch";
export type LLMAttemptOutcome = "success" | "error" | "success_without_usage";

export type LLMAttemptOutcomeTelemetry =
  | {
      outcome: "error";
      errorType: LLMErrorType;
      errorSource: ErrorSource;
    }
  | {
      outcome: Exclude<LLMAttemptOutcome, "error">;
    };

export function requestedReasoningEffortTag(
  requestedReasoningEffort: ReasoningEffort | null
): string {
  return `requested_reasoning_effort:${requestedReasoningEffort ?? "none"}`;
}

export function emitLLMDurationMs({
  durationMs,
  tags,
  ...outcomeTelemetry
}: {
  durationMs: number;
  tags: string[];
} & LLMAttemptOutcomeTelemetry): void {
  let durationTags: string[];
  switch (outcomeTelemetry.outcome) {
    case "error":
      durationTags = [
        ...tags,
        `outcome:${outcomeTelemetry.outcome}`,
        `error_type:${outcomeTelemetry.errorType}`,
        `error_source:${outcomeTelemetry.errorSource}`,
      ];
      break;
    case "success":
    case "success_without_usage":
      durationTags = [...tags, `outcome:${outcomeTelemetry.outcome}`];
      break;
    default:
      assertNever(outcomeTelemetry);
  }

  statsDMetrics.distribution("llm_duration_ms", durationMs, durationTags);
}

export function emitLLMTimeToFirstEventMs(
  timeToFirstEventMs: number | undefined,
  tags: string[]
): void {
  if (timeToFirstEventMs === undefined) {
    return;
  }
  statsDMetrics.distribution(
    "llm_time_to_first_event_ms",
    timeToFirstEventMs,
    tags
  );
}

export function emitLLMTimeToFirstTokenMs(
  timeToFirstTokenMs: number | undefined,
  tags: string[]
): void {
  if (timeToFirstTokenMs === undefined) {
    return;
  }
  statsDMetrics.distribution(
    "llm_time_to_first_token_ms",
    timeToFirstTokenMs,
    tags
  );
}

export function llmAttemptLogFields({
  durationMs,
  timeToFirstEventMs,
  timeToFirstTokenMs,
  requestedReasoningEffort,
  surface,
}: {
  durationMs?: number;
  timeToFirstEventMs?: number;
  timeToFirstTokenMs?: number;
  requestedReasoningEffort: ReasoningEffort | null;
  surface: LLMTelemetrySurface;
}): {
  durationMs?: number;
  timeToFirstEventMs?: number;
  timeToFirstTokenMs?: number;
  requestedReasoningEffort: ReasoningEffort | null;
  surface: LLMTelemetrySurface;
} {
  return {
    ...(durationMs !== undefined ? { durationMs } : {}),
    ...(timeToFirstEventMs !== undefined ? { timeToFirstEventMs } : {}),
    ...(timeToFirstTokenMs !== undefined ? { timeToFirstTokenMs } : {}),
    requestedReasoningEffort,
    surface,
  };
}
