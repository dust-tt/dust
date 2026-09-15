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

function isTerminalActivityTimeout(
  error: unknown,
  activityName: string
): error is ActivityFailure {
  if (
    !(error instanceof ActivityFailure) ||
    error.activityType !== activityName
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

export function isTerminalRunModelTimeout(
  error: unknown
): error is ActivityFailure {
  return isTerminalActivityTimeout(error, RUN_MODEL_ACTIVITY_NAME);
}

export function isTerminalRunToolTimeout(
  error: unknown
): error is ActivityFailure {
  return isTerminalActivityTimeout(error, RUN_TOOL_ACTIVITY_NAME);
}

// Decides whether agentLoopWorkflow completes instead of failing after an error: the message is
// finalized as errored either way, so swallowing only removes the FAILED status. Model timeouts
// are swallowed when the failure chain proves the blocked work was an LLM provider timeout. Tool
// activity timeouts are infrastructure failures (pod killed without drain, heartbeat starvation),
// not tool errors (tools report those as events): swallowToolTimeouts carries the workflow's
// patched() state so replays of histories predating the patch keep the legacy throw. Anything
// else fails the workflow.
export function isSwallowableWorkflowFailure(
  error: unknown,
  { swallowToolTimeouts }: { swallowToolTimeouts: boolean }
): boolean {
  if (
    isTerminalRunModelTimeout(error) &&
    isRunModelLLMUnresponsiveError(error)
  ) {
    return true;
  }

  return swallowToolTimeouts && isTerminalRunToolTimeout(error);
}

// Structured failure fields for the finalize activity's log: which activity failed, how its retry
// policy ended and which timeout fired. Enum values are stringified since they cross the
// workflow to activity payload boundary.
export function getWorkflowFailureDetails(error: unknown): {
  activityType?: string;
  retryState?: string;
  timeoutType?: string;
} {
  if (!(error instanceof ActivityFailure)) {
    return {};
  }

  return {
    activityType: error.activityType,
    ...(error.retryState !== undefined
      ? { retryState: RetryState[error.retryState] }
      : {}),
    ...(error.cause instanceof TimeoutFailure &&
    error.cause.timeoutType !== undefined
      ? { timeoutType: TimeoutType[error.cause.timeoutType] }
      : {}),
  };
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
