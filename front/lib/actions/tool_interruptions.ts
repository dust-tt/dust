import { RETRY_ON_INTERRUPT_MAX_ATTEMPTS } from "@app/lib/actions/constants";
import type { MCPToolRetryPolicyType } from "@app/lib/api/mcp";
import {
  classifyTemporalAbortReason,
  classifyTemporalAbortSignal,
  type TemporalAbortClassification,
} from "@app/lib/temporal/cancellation";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { ApplicationFailure } from "@temporalio/common";

export const TOOL_INTERRUPTION_ERROR_TYPE = "ToolInterruption";

export type ToolAbortClassification =
  | "deploy_interruption"
  | "user_cancellation"
  | "none";
export type HandledToolAbortClassification = Exclude<
  ToolAbortClassification,
  "none"
>;

function classifyToolAbort(
  abortClassification: TemporalAbortClassification
): ToolAbortClassification {
  switch (abortClassification) {
    case "worker_shutdown":
      return "deploy_interruption";

    case "user_cancellation":
      return "user_cancellation";

    case "none":
      return "none";

    default:
      assertNever(abortClassification);
  }
}

export function classifyToolAbortReason(
  reason: unknown
): ToolAbortClassification {
  return classifyToolAbort(classifyTemporalAbortReason(reason));
}

export function classifyToolAbortSignal(
  signal?: AbortSignal | null
): ToolAbortClassification {
  return classifyToolAbort(classifyTemporalAbortSignal(signal));
}

export function shouldRetryToolInterruption({
  isInterruption,
  attempt,
  retryPolicy,
}: {
  isInterruption: boolean;
  attempt: number;
  retryPolicy: MCPToolRetryPolicyType;
}): boolean {
  return (
    isInterruption &&
    retryPolicy === "retry_on_interrupt" &&
    attempt < RETRY_ON_INTERRUPT_MAX_ATTEMPTS
  );
}

export function makeToolInterruptionError(): ApplicationFailure {
  return ApplicationFailure.retryable(
    "Tool execution interrupted by worker shutdown",
    TOOL_INTERRUPTION_ERROR_TYPE
  );
}

export function isToolInterruptionError(error: unknown): boolean {
  return (
    error instanceof ApplicationFailure &&
    error.type === TOOL_INTERRUPTION_ERROR_TYPE
  );
}
