import type { ProtoFailure } from "@temporalio/common";
import {
  ActivityFailure,
  RetryState,
  TimeoutFailure,
  TimeoutType,
} from "@temporalio/common";
import { describe, expect, it } from "vitest";

import {
  isRunModelAndCreateActionsActivityLLMUnresponsive,
  isTerminalRunModelAndCreateActionsTimeout,
  RUN_MODEL_AND_CREATE_ACTIONS_ACTIVITY_NAME,
} from "./workflow_failures";

const LLM_TIMEOUT_MESSAGE =
  "LLM error (llm_timeout_error): Anthropic is taking longer than expected. Please try again.";

function makeActivityFailure({
  activityType = RUN_MODEL_AND_CREATE_ACTIONS_ACTIVITY_NAME,
  llmErrorMessage = LLM_TIMEOUT_MESSAGE,
  retryState = RetryState.MAXIMUM_ATTEMPTS_REACHED,
  timeoutType = TimeoutType.HEARTBEAT,
}: {
  activityType?: string;
  llmErrorMessage?: string | null;
  retryState?: RetryState;
  timeoutType?: TimeoutType;
} = {}) {
  const timeoutFailure = new TimeoutFailure(
    "activity timed out",
    undefined,
    timeoutType
  );

  if (llmErrorMessage) {
    timeoutFailure.failure = {
      message: "activity timed out",
      cause: {
        message: llmErrorMessage,
        applicationFailureInfo: { type: "Error" },
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

function shouldSwallowWorkflowFailure(error: unknown): boolean {
  return (
    isTerminalRunModelAndCreateActionsTimeout(error) &&
    isRunModelAndCreateActionsActivityLLMUnresponsive(error)
  );
}

describe("workflow failure predicates", () => {
  it("matches terminal heartbeat timeouts with an LLM timeout cause", () => {
    const failure = makeActivityFailure();

    expect(isTerminalRunModelAndCreateActionsTimeout(failure)).toBe(true);
    expect(isRunModelAndCreateActionsActivityLLMUnresponsive(failure)).toBe(
      true
    );
    expect(shouldSwallowWorkflowFailure(failure)).toBe(true);
  });

  it("matches terminal StartToClose timeouts with an LLM request timeout cause", () => {
    const failure = makeActivityFailure({
      llmErrorMessage: "LLM error (timeout_error): The request timed out.",
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

    expect(isTerminalRunModelAndCreateActionsTimeout(failure)).toBe(true);
    expect(isRunModelAndCreateActionsActivityLLMUnresponsive(failure)).toBe(
      false
    );
    expect(shouldSwallowWorkflowFailure(failure)).toBe(false);
  });

  it("ignores non-timeout LLM causes", () => {
    const failure = makeActivityFailure({
      llmErrorMessage: "LLM error (rate_limit_error): Too many requests.",
    });

    expect(isTerminalRunModelAndCreateActionsTimeout(failure)).toBe(true);
    expect(isRunModelAndCreateActionsActivityLLMUnresponsive(failure)).toBe(
      false
    );
    expect(shouldSwallowWorkflowFailure(failure)).toBe(false);
  });

  it("ignores non-terminal or unrelated activity failures", () => {
    const nonTerminalFailure = makeActivityFailure({
      retryState: RetryState.IN_PROGRESS,
    });
    const unrelatedActivityFailure = makeActivityFailure({
      activityType: "runToolActivity",
    });

    expect(isTerminalRunModelAndCreateActionsTimeout(nonTerminalFailure)).toBe(
      false
    );
    expect(shouldSwallowWorkflowFailure(nonTerminalFailure)).toBe(false);
    expect(
      isTerminalRunModelAndCreateActionsTimeout(unrelatedActivityFailure)
    ).toBe(false);
    expect(shouldSwallowWorkflowFailure(unrelatedActivityFailure)).toBe(false);
  });
});
