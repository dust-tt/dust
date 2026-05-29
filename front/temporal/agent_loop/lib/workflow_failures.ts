import {
  ActivityFailure,
  ApplicationFailure,
  type ProtoFailure,
  RetryState,
  TemporalFailure,
  TimeoutFailure,
  TimeoutType,
} from "@temporalio/common";

import { isRunModelAndCreateActionsLLMUnresponsiveFailureType } from "./run_model_errors";

export const RUN_MODEL_AND_CREATE_ACTIONS_ACTIVITY_NAME =
  "runModelAndCreateActionsActivity";

// Keep matching failures produced before runModel started throwing typed ApplicationFailures.
const LEGACY_LLM_UNRESPONSIVE_MESSAGE_REGEXP =
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

  return isRunModelAndCreateActionsActivityLLMUnresponsiveError(error);
}

function isRunModelAndCreateActionsActivityLLMUnresponsiveError(
  error: Error
): boolean {
  if (
    error instanceof ApplicationFailure &&
    isRunModelAndCreateActionsLLMUnresponsiveFailureType(error.type)
  ) {
    return true;
  }

  if (isLegacyRunModelAndCreateActionsLLMUnresponsiveMessage(error.message)) {
    return true;
  }

  if (
    error instanceof TemporalFailure &&
    error.failure &&
    isRunModelAndCreateActionsActivityLLMUnresponsiveProtoFailure(error.failure)
  ) {
    return true;
  }

  if (error.cause instanceof Error) {
    return isRunModelAndCreateActionsActivityLLMUnresponsiveError(error.cause);
  }

  return false;
}

function isRunModelAndCreateActionsActivityLLMUnresponsiveProtoFailure(
  failure: ProtoFailure
): boolean {
  if (
    isRunModelAndCreateActionsLLMUnresponsiveFailureType(
      failure.applicationFailureInfo?.type
    )
  ) {
    return true;
  }

  if (isLegacyRunModelAndCreateActionsLLMUnresponsiveMessage(failure.message)) {
    return true;
  }

  if (failure.cause) {
    return isRunModelAndCreateActionsActivityLLMUnresponsiveProtoFailure(
      failure.cause
    );
  }

  return false;
}

function isLegacyRunModelAndCreateActionsLLMUnresponsiveMessage(
  message: string | null | undefined
): boolean {
  return Boolean(message?.match(LEGACY_LLM_UNRESPONSIVE_MESSAGE_REGEXP));
}
