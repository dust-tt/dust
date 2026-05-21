import { DUST_WORKER_SHUTDOWN_ABORT_REASON } from "@app/lib/shutdown_signal";

// The SDK documents WORKER_SHUTDOWN as CancelledFailure.message, but does not
// expose the reason string from @temporalio/worker's public root module.
const TEMPORAL_WORKER_SHUTDOWN_REASON = "WORKER_SHUTDOWN";
const TEMPORAL_WORKER_SHUTDOWN_ERROR = "CancelledFailure: WORKER_SHUTDOWN";
const TEMPORAL_USER_CANCELLATION_REASON = "CANCELLED";
const TEMPORAL_USER_CANCELLATION_ERROR = "CancelledFailure: CANCELLED";
const WORKER_SHUTDOWN_REASON_TEXTS: readonly string[] = [
  DUST_WORKER_SHUTDOWN_ABORT_REASON,
  TEMPORAL_WORKER_SHUTDOWN_REASON,
  TEMPORAL_WORKER_SHUTDOWN_ERROR,
];
const USER_CANCELLATION_REASON_TEXTS: readonly string[] = [
  TEMPORAL_USER_CANCELLATION_REASON,
  TEMPORAL_USER_CANCELLATION_ERROR,
];

export type TemporalAbortClassification =
  | "worker_shutdown"
  | "user_cancellation"
  | "none";

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

export function classifyTemporalAbortReason(
  reason: unknown
): TemporalAbortClassification {
  const reasonTexts = getAbortReasonTexts(reason);

  if (reasonTexts.some((text) => WORKER_SHUTDOWN_REASON_TEXTS.includes(text))) {
    return "worker_shutdown";
  }

  if (
    reasonTexts.some((text) => USER_CANCELLATION_REASON_TEXTS.includes(text))
  ) {
    return "user_cancellation";
  }

  return "none";
}

export function classifyTemporalAbortSignal(
  signal?: AbortSignal | null
): TemporalAbortClassification {
  if (!signal?.aborted) {
    return "none";
  }

  return classifyTemporalAbortReason(signal.reason);
}
