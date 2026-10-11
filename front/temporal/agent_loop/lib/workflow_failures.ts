import type { ProtoFailure } from "@temporalio/common";
import {
  ActivityFailure,
  ApplicationFailure,
  RetryState,
  TemporalFailure,
  TimeoutFailure,
  TimeoutType,
} from "@temporalio/common";

import { isRunModelLLMUnresponsiveFailureType } from "./run_model_errors";

export const RUN_MODEL_ACTIVITY_NAME = "runModelAndCreateActionsActivity";
export const RUN_TOOL_ACTIVITY_NAME = "runToolActivity";

function isTerminalRetryState(retryState: RetryState): boolean {
  return (
    retryState === RetryState.MAXIMUM_ATTEMPTS_REACHED ||
    retryState === RetryState.TIMEOUT
  );
}

export function isTerminalRunModelTimeout(
  error: unknown
): error is ActivityFailure {
  return isTerminalActivityTimeout(error, RUN_MODEL_ACTIVITY_NAME);
}

// A tool activity whose worker died or froze, or that stalled without heartbeating, ends with a
// terminal heartbeat or start-to-close timeout.
export function isTerminalToolTimeout(
  error: unknown
): error is ActivityFailure {
  return isTerminalActivityTimeout(error, RUN_TOOL_ACTIVITY_NAME);
}

function isTerminalActivityTimeout(
  error: unknown,
  activityType: string
): error is ActivityFailure {
  if (
    !(error instanceof ActivityFailure) ||
    error.activityType !== activityType
  ) {
    return false;
  }

  if (!isTerminalRetryState(error.retryState)) {
    return false;
  }

  if (!(error.cause instanceof TimeoutFailure)) {
    return false;
  }

  return (
    error.cause.timeoutType === TimeoutType.START_TO_CLOSE ||
    error.cause.timeoutType === TimeoutType.HEARTBEAT
  );
}

export function isRunModelLLMUnresponsiveError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  if (
    error instanceof ApplicationFailure &&
    isRunModelLLMUnresponsiveFailureType(error.type)
  ) {
    return true;
  }

  if (
    error instanceof TemporalFailure &&
    error.failure &&
    isLLMUnresponsiveProtoFailure(error.failure)
  ) {
    return true;
  }

  if (error.cause instanceof Error) {
    return isRunModelLLMUnresponsiveError(error.cause);
  }

  return false;
}

function isLLMUnresponsiveProtoFailure(failure: ProtoFailure): boolean {
  if (
    isRunModelLLMUnresponsiveFailureType(failure.applicationFailureInfo?.type)
  ) {
    return true;
  }

  if (failure.cause) {
    return isLLMUnresponsiveProtoFailure(failure.cause);
  }

  return false;
}
