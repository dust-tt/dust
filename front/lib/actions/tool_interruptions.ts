import { RETRY_ON_INTERRUPT_MAX_ATTEMPTS } from "@app/lib/actions/constants";
import type { MCPToolRetryPolicyType } from "@app/lib/api/mcp";
import { DUST_WORKER_SHUTDOWN_ABORT_REASON } from "@app/lib/shutdown_signal";
import { ApplicationFailure } from "@temporalio/common";

const TEMPORAL_WORKER_SHUTDOWN_REASON = "WORKER_SHUTDOWN";
const TEMPORAL_WORKER_SHUTDOWN_ERROR = "CancelledFailure: WORKER_SHUTDOWN";
const TEMPORAL_USER_CANCELLATION_REASON = "CANCELLED";
const TEMPORAL_USER_CANCELLATION_ERROR = "CancelledFailure: CANCELLED";
const DEPLOY_INTERRUPTION_REASON_TEXTS: readonly string[] = [
  DUST_WORKER_SHUTDOWN_ABORT_REASON,
  TEMPORAL_WORKER_SHUTDOWN_REASON,
  TEMPORAL_WORKER_SHUTDOWN_ERROR,
];
const USER_CANCELLATION_REASON_TEXTS: readonly string[] = [
  TEMPORAL_USER_CANCELLATION_REASON,
  TEMPORAL_USER_CANCELLATION_ERROR,
];

export const TOOL_DEPLOY_INTERRUPTION_ERROR_TYPE = "ToolDeployInterruption";

export type ToolAbortClassification =
  | "deploy_interruption"
  | "user_cancellation"
  | "unknown";
export type ToolInterruptionType = "deploy_interruption" | "timeout";

function getAbortReasonTexts(reason: unknown): string[] {
  if (typeof reason === "string") {
    return [reason];
  }

  if (reason instanceof Error) {
    return [reason.message, reason.toString()];
  }

  if (
    typeof reason === "object" &&
    reason !== null &&
    "message" in reason &&
    typeof reason.message === "string"
  ) {
    return [reason.message];
  }

  return [];
}

export function classifyToolAbortReason(
  reason: unknown
): ToolAbortClassification {
  const reasonTexts = getAbortReasonTexts(reason);

  if (
    reasonTexts.some((text) => DEPLOY_INTERRUPTION_REASON_TEXTS.includes(text))
  ) {
    return "deploy_interruption";
  }

  if (
    reasonTexts.some((text) => USER_CANCELLATION_REASON_TEXTS.includes(text))
  ) {
    return "user_cancellation";
  }

  return "unknown";
}

export function classifyToolAbortSignal(
  signal: AbortSignal
): ToolAbortClassification {
  if (!signal.aborted) {
    return "unknown";
  }

  return classifyToolAbortReason(signal.reason);
}

export function shouldRetryToolInterruption({
  interruptionType,
  attempt,
  retryPolicy,
}: {
  interruptionType: ToolInterruptionType | null;
  attempt: number;
  retryPolicy: MCPToolRetryPolicyType;
}): boolean {
  return (
    interruptionType !== null &&
    retryPolicy === "retry_on_interrupt" &&
    attempt < RETRY_ON_INTERRUPT_MAX_ATTEMPTS
  );
}

export function makeRetryableToolDeployInterruptionError(): ApplicationFailure {
  return ApplicationFailure.retryable(
    "Tool execution interrupted by worker shutdown",
    TOOL_DEPLOY_INTERRUPTION_ERROR_TYPE
  );
}

export function isRetryableToolDeployInterruptionError(
  error: unknown
): boolean {
  return (
    error instanceof ApplicationFailure &&
    error.type === TOOL_DEPLOY_INTERRUPTION_ERROR_TYPE
  );
}
