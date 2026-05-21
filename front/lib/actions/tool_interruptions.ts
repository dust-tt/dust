import { RETRY_ON_INTERRUPT_MAX_ATTEMPTS } from "@app/lib/actions/constants";
import type { MCPToolRetryPolicyType } from "@app/lib/api/mcp";
import { DUST_WORKER_SHUTDOWN_ABORT_REASON } from "@app/lib/shutdown_signal";
import { ApplicationFailure } from "@temporalio/common";

const TEMPORAL_WORKER_SHUTDOWN_REASON = "WORKER_SHUTDOWN";
const TEMPORAL_WORKER_SHUTDOWN_ERROR = "CancelledFailure: WORKER_SHUTDOWN";
const TEMPORAL_USER_CANCELLATION_REASON = "CANCELLED";
const TEMPORAL_USER_CANCELLATION_ERROR = "CancelledFailure: CANCELLED";

export const TOOL_DEPLOY_INTERRUPTION_ERROR_TYPE = "ToolDeployInterruption";

export type ToolAbortClassification =
  | "deploy_interruption"
  | "user_cancellation"
  | "unknown";
export type ToolInterruptionType = "deploy_interruption" | "timeout";

function getAbortReasonMessage(reason: unknown): string | null {
  if (typeof reason === "string") {
    return reason;
  }

  if (reason instanceof Error) {
    return reason.message;
  }

  if (
    typeof reason === "object" &&
    reason !== null &&
    "message" in reason &&
    typeof reason.message === "string"
  ) {
    return reason.message;
  }

  return null;
}

function getAbortReasonText(reason: unknown): string | null {
  if (typeof reason === "string") {
    return reason;
  }

  if (reason instanceof Error) {
    return reason.toString();
  }

  return null;
}

export function classifyToolAbortReason(
  reason: unknown
): ToolAbortClassification {
  const message = getAbortReasonMessage(reason);
  const text = getAbortReasonText(reason);

  if (
    message === DUST_WORKER_SHUTDOWN_ABORT_REASON ||
    message === TEMPORAL_WORKER_SHUTDOWN_REASON ||
    message === TEMPORAL_WORKER_SHUTDOWN_ERROR ||
    text === DUST_WORKER_SHUTDOWN_ABORT_REASON ||
    text === TEMPORAL_WORKER_SHUTDOWN_REASON ||
    text === TEMPORAL_WORKER_SHUTDOWN_ERROR
  ) {
    return "deploy_interruption";
  }

  if (
    message === TEMPORAL_USER_CANCELLATION_REASON ||
    message === TEMPORAL_USER_CANCELLATION_ERROR ||
    text === TEMPORAL_USER_CANCELLATION_ERROR
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
