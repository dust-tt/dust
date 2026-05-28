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

export const LLM_PROVIDER_TIMEOUT_ERROR_NAME = "LLMProviderTimeoutError";
export const DEFAULT_LLM_PROVIDER_TIMEOUT_ERROR_MESSAGE =
  "The AI provider is taking longer than expected. Please try again.";

const LLM_PROVIDER_TIMEOUT_MESSAGE_REGEXP =
  /(?:^|Error:\s*)LLM error \((?:llm_timeout_error|timeout_error)\): (.+)$/;

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

function findLLMProviderTimeoutMessage(error: Error): string | null {
  for (const message of getErrorMessages(error)) {
    const match = message.match(LLM_PROVIDER_TIMEOUT_MESSAGE_REGEXP);
    if (match?.[1]) {
      return match[1];
    }
  }

  return null;
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

export function getTerminalRunModelAndCreateActionsProviderTimeout(
  error: unknown
): {
  message: string;
  name: typeof LLM_PROVIDER_TIMEOUT_ERROR_NAME;
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

  const message = findLLMProviderTimeoutMessage(error);
  if (!message) {
    return null;
  }

  return {
    message,
    name: LLM_PROVIDER_TIMEOUT_ERROR_NAME,
    timeoutType: error.cause.timeoutType,
  };
}

export function isTerminalRunModelAndCreateActionsProviderTimeout(
  error: unknown
): error is ActivityFailure {
  return getTerminalRunModelAndCreateActionsProviderTimeout(error) !== null;
}
