import {
  ActivityFailure,
  RetryState,
  TimeoutFailure,
  TimeoutType,
} from "@temporalio/common";

export const RUN_MODEL_AND_CREATE_ACTIONS_ACTIVITY_NAME =
  "runModelAndCreateActionsActivity";

function isRunModelAndCreateActionsActivityFailure(
  error: unknown
): error is ActivityFailure {
  if (!(error instanceof ActivityFailure)) {
    return false;
  }

  return error.activityType === RUN_MODEL_AND_CREATE_ACTIONS_ACTIVITY_NAME;
}

function isTerminalRetryState(retryState: RetryState): boolean {
  return (
    retryState === RetryState.MAXIMUM_ATTEMPTS_REACHED ||
    retryState === RetryState.TIMEOUT
  );
}

export function getTerminalRunModelAndCreateActionsTimeout(error: unknown): {
  activityType: typeof RUN_MODEL_AND_CREATE_ACTIONS_ACTIVITY_NAME;
  timeoutType: TimeoutType;
} | null {
  if (!isRunModelAndCreateActionsActivityFailure(error)) {
    return null;
  }

  if (!isTerminalRetryState(error.retryState)) {
    return null;
  }

  if (!(error.cause instanceof TimeoutFailure)) {
    return null;
  }

  if (
    error.cause.timeoutType !== TimeoutType.START_TO_CLOSE &&
    error.cause.timeoutType !== TimeoutType.HEARTBEAT
  ) {
    return null;
  }

  return {
    activityType: RUN_MODEL_AND_CREATE_ACTIONS_ACTIVITY_NAME,
    timeoutType: error.cause.timeoutType,
  };
}

export function isTerminalRunModelAndCreateActionsTimeout(
  error: unknown
): error is ActivityFailure {
  return getTerminalRunModelAndCreateActionsTimeout(error) !== null;
}
