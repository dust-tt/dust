import {
  ActivityFailure,
  RetryState,
  TimeoutFailure,
  TimeoutType,
} from "@temporalio/common";

const RUN_MODEL_AND_CREATE_ACTIONS_ACTIVITY_NAME =
  "runModelAndCreateActionsActivity";

export function isTerminalRunModelAndCreateActionsTimeout(
  error: unknown
): error is ActivityFailure {
  if (!(error instanceof ActivityFailure)) {
    return false;
  }

  if (error.activityType !== RUN_MODEL_AND_CREATE_ACTIONS_ACTIVITY_NAME) {
    return false;
  }

  if (error.retryState !== RetryState.MAXIMUM_ATTEMPTS_REACHED) {
    return false;
  }

  if (!(error.cause instanceof TimeoutFailure)) {
    return false;
  }

  return error.cause.timeoutType === TimeoutType.START_TO_CLOSE;
}
