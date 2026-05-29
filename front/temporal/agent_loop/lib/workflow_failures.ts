import {
  ActivityFailure,
  type ProtoFailure,
  RetryState,
  TemporalFailure,
  TimeoutFailure,
  TimeoutType,
} from "@temporalio/common";

export const RUN_MODEL_AND_CREATE_ACTIONS_ACTIVITY_NAME =
  "runModelAndCreateActionsActivity";

const LLM_UNRESPONSIVE_MESSAGE_REGEXP =
  /(?:^|Error:\s*)LLM error \((?:llm_timeout_error|timeout_error)\): /;

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

function* getErrorMessages(error: Error): Generator<string> {
  if (error.message) {
    yield error.message;
  }

  if (error instanceof TemporalFailure && error.failure) {
    yield* getProtoFailureMessages(error.failure);
  }

  if (error.cause instanceof Error) {
    yield* getErrorMessages(error.cause);
  }
}

function* getProtoFailureMessages(failure: ProtoFailure): Generator<string> {
  if (failure.message) {
    yield failure.message;
  }

  if (failure.cause) {
    yield* getProtoFailureMessages(failure.cause);
  }
}

export function isTerminalRunModelAndCreateActionsTimeout(
  error: unknown
): error is ActivityFailure {
  if (!isRunModelAndCreateActionsActivityFailure(error)) {
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

export function isRunModelAndCreateActionsActivityLLMUnresponsive(
  error: unknown
): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  for (const message of getErrorMessages(error)) {
    if (LLM_UNRESPONSIVE_MESSAGE_REGEXP.test(message)) {
      return true;
    }
  }

  return false;
}
