import type { LLMErrorType } from "@app/lib/api/llm/types/errors";
import type { ProtoFailure } from "@temporalio/common";
import {
  ActivityFailure,
  RetryState,
  TimeoutFailure,
  TimeoutType,
} from "@temporalio/common";
import { describe, expect, it } from "vitest";

import { makeRunModelLLMError } from "./run_model_errors";
import {
  isRunModelLLMUnresponsiveError,
  isTerminalRunModelLLMUnresponsiveFailure,
  isTerminalRunModelTimeout,
  RUN_MODEL_ACTIVITY_NAME,
} from "./workflow_failures";

const LLM_TIMEOUT_MESSAGE =
  "Anthropic is taking longer than expected. Please try again.";

function makeActivityFailure({
  activityType = RUN_MODEL_ACTIVITY_NAME,
  llmErrorType = "llm_timeout_error",
  llmErrorMessage = LLM_TIMEOUT_MESSAGE,
  retryState = RetryState.MAXIMUM_ATTEMPTS_REACHED,
  timeoutType = TimeoutType.HEARTBEAT,
}: {
  activityType?: string;
  llmErrorType?: LLMErrorType | null;
  llmErrorMessage?: string | null;
  retryState?: RetryState;
  timeoutType?: TimeoutType;
} = {}) {
  const timeoutFailure = new TimeoutFailure(
    "activity timed out",
    undefined,
    timeoutType
  );

  if (llmErrorType && llmErrorMessage) {
    const llmError = makeRunModelLLMError({
      type: llmErrorType,
      message: llmErrorMessage,
    });

    timeoutFailure.failure = {
      message: "activity timed out",
      cause: {
        message: "application failure",
        applicationFailureInfo: { type: llmError.type },
      },
    } satisfies ProtoFailure;
  }

  return new ActivityFailure(
    "Activity task timed out",
    activityType,
    "activity-id",
    retryState,
    "worker-id",
    timeoutFailure
  );
}

function makeApplicationActivityFailure({
  activityType = RUN_MODEL_ACTIVITY_NAME,
  llmErrorType = "llm_timeout_error",
  llmErrorMessage = LLM_TIMEOUT_MESSAGE,
  retryState = RetryState.MAXIMUM_ATTEMPTS_REACHED,
}: {
  activityType?: string;
  llmErrorType?: LLMErrorType;
  llmErrorMessage?: string;
  retryState?: RetryState;
} = {}) {
  return new ActivityFailure(
    "Activity task failed",
    activityType,
    "activity-id",
    retryState,
    "worker-id",
    makeRunModelLLMError({
      type: llmErrorType,
      message: llmErrorMessage,
    })
  );
}

function shouldSwallowWorkflowFailure(error: unknown): boolean {
  return isTerminalRunModelLLMUnresponsiveFailure(error);
}

describe("workflow failure predicates", () => {
  it("matches terminal heartbeat timeouts with an LLM timeout cause", () => {
    const failure = makeActivityFailure();

    expect(isTerminalRunModelTimeout(failure)).toBe(true);
    expect(isRunModelLLMUnresponsiveError(failure)).toBe(true);
    expect(shouldSwallowWorkflowFailure(failure)).toBe(true);
  });

  it("matches terminal runModel LLM application failures", () => {
    const failure = makeApplicationActivityFailure();

    expect(isTerminalRunModelTimeout(failure)).toBe(false);
    expect(isRunModelLLMUnresponsiveError(failure)).toBe(true);
    expect(isTerminalRunModelLLMUnresponsiveFailure(failure)).toBe(true);
    expect(shouldSwallowWorkflowFailure(failure)).toBe(true);
  });

  it("ignores non-terminal runModel LLM application failures", () => {
    const failure = makeApplicationActivityFailure({
      retryState: RetryState.IN_PROGRESS,
    });

    expect(isRunModelLLMUnresponsiveError(failure)).toBe(true);
    expect(isTerminalRunModelLLMUnresponsiveFailure(failure)).toBe(false);
    expect(shouldSwallowWorkflowFailure(failure)).toBe(false);
  });

  it("ignores terminal runModel non-timeout application failures", () => {
    const failure = makeApplicationActivityFailure({
      llmErrorType: "rate_limit_error",
      llmErrorMessage: "Too many requests.",
    });

    expect(isRunModelLLMUnresponsiveError(failure)).toBe(false);
    expect(isTerminalRunModelLLMUnresponsiveFailure(failure)).toBe(false);
    expect(shouldSwallowWorkflowFailure(failure)).toBe(false);
  });

  it("matches terminal StartToClose timeouts with an LLM request timeout cause", () => {
    const failure = makeActivityFailure({
      llmErrorType: "timeout_error",
      llmErrorMessage: "The request timed out.",
      retryState: RetryState.TIMEOUT,
      timeoutType: TimeoutType.START_TO_CLOSE,
    });

    expect(shouldSwallowWorkflowFailure(failure)).toBe(true);
  });

  it("ignores activity timeouts without an LLM timeout cause", () => {
    const failure = makeActivityFailure({
      llmErrorMessage: null,
      timeoutType: TimeoutType.START_TO_CLOSE,
    });

    expect(isTerminalRunModelTimeout(failure)).toBe(true);
    expect(isRunModelLLMUnresponsiveError(failure)).toBe(false);
    expect(shouldSwallowWorkflowFailure(failure)).toBe(false);
  });

  it("ignores non-timeout LLM causes", () => {
    const failure = makeActivityFailure({
      llmErrorType: "rate_limit_error",
      llmErrorMessage: "Too many requests.",
    });

    expect(isTerminalRunModelTimeout(failure)).toBe(true);
    expect(isRunModelLLMUnresponsiveError(failure)).toBe(false);
    expect(shouldSwallowWorkflowFailure(failure)).toBe(false);
  });

  it("ignores non-terminal or unrelated activity failures", () => {
    const nonTerminalFailure = makeActivityFailure({
      retryState: RetryState.IN_PROGRESS,
    });
    const unrelatedActivityFailure = makeActivityFailure({
      activityType: "runToolActivity",
    });

    expect(isTerminalRunModelTimeout(nonTerminalFailure)).toBe(false);
    expect(shouldSwallowWorkflowFailure(nonTerminalFailure)).toBe(false);
    expect(isTerminalRunModelTimeout(unrelatedActivityFailure)).toBe(false);
    expect(shouldSwallowWorkflowFailure(unrelatedActivityFailure)).toBe(false);
  });
});
