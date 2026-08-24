import type { LLMErrorType } from "@app/lib/api/llm/types/errors";
import type { ProtoFailure } from "@temporalio/common";
import {
  ActivityFailure,
  ApplicationFailure,
  RetryState,
  TimeoutFailure,
  TimeoutType,
} from "@temporalio/common";
import { describe, expect, it } from "vitest";

import { makeRunModelLLMError } from "./run_model_errors";
import {
  getWorkflowFailureDetails,
  isRunModelLLMUnresponsiveError,
  isSwallowableWorkflowFailure,
  isTerminalRunModelTimeout,
  isTerminalRunToolTimeout,
  RUN_MODEL_ACTIVITY_NAME,
  RUN_TOOL_ACTIVITY_NAME,
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

// The production decision, with the tool-timeout patch active as it is for new executions.
function shouldSwallowWorkflowFailure(error: unknown): boolean {
  return isSwallowableWorkflowFailure(error, { swallowToolTimeouts: true });
}

describe("workflow failure predicates", () => {
  it("matches terminal heartbeat timeouts with an LLM timeout cause", () => {
    const failure = makeActivityFailure();

    expect(isTerminalRunModelTimeout(failure)).toBe(true);
    expect(isRunModelLLMUnresponsiveError(failure)).toBe(true);
    expect(shouldSwallowWorkflowFailure(failure)).toBe(true);
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
      activityType: "checkCreditsActivity",
    });

    expect(isTerminalRunModelTimeout(nonTerminalFailure)).toBe(false);
    expect(shouldSwallowWorkflowFailure(nonTerminalFailure)).toBe(false);
    expect(isTerminalRunModelTimeout(unrelatedActivityFailure)).toBe(false);
    expect(shouldSwallowWorkflowFailure(unrelatedActivityFailure)).toBe(false);
  });

  it("matches terminal tool heartbeat timeouts, the single-attempt no_retry case included", () => {
    // A no_retry tool activity has maximumAttempts 1: its first heartbeat timeout is terminal
    // with MAXIMUM_ATTEMPTS_REACHED.
    const failure = makeActivityFailure({
      activityType: RUN_TOOL_ACTIVITY_NAME,
      llmErrorType: null,
      llmErrorMessage: null,
    });

    expect(isTerminalRunToolTimeout(failure)).toBe(true);
    expect(shouldSwallowWorkflowFailure(failure)).toBe(true);
  });

  it("matches terminal tool StartToClose timeouts", () => {
    const failure = makeActivityFailure({
      activityType: RUN_TOOL_ACTIVITY_NAME,
      llmErrorType: null,
      llmErrorMessage: null,
      retryState: RetryState.TIMEOUT,
      timeoutType: TimeoutType.START_TO_CLOSE,
    });

    expect(isTerminalRunToolTimeout(failure)).toBe(true);
    expect(shouldSwallowWorkflowFailure(failure)).toBe(true);
  });

  it("ignores non-terminal tool timeouts and non-timeout tool failures", () => {
    const nonTerminalFailure = makeActivityFailure({
      activityType: RUN_TOOL_ACTIVITY_NAME,
      llmErrorType: null,
      llmErrorMessage: null,
      retryState: RetryState.IN_PROGRESS,
    });
    // A tool throwing an application error (not a timeout) must still fail the workflow.
    const applicationFailure = new ActivityFailure(
      "Activity task failed",
      RUN_TOOL_ACTIVITY_NAME,
      "activity-id",
      RetryState.MAXIMUM_ATTEMPTS_REACHED,
      "worker-id",
      ApplicationFailure.create({ message: "tool blew up" })
    );

    expect(isTerminalRunToolTimeout(nonTerminalFailure)).toBe(false);
    expect(shouldSwallowWorkflowFailure(nonTerminalFailure)).toBe(false);
    expect(isTerminalRunToolTimeout(applicationFailure)).toBe(false);
    expect(shouldSwallowWorkflowFailure(applicationFailure)).toBe(false);
  });

  it("keeps the legacy throw for tool timeouts when the patch is inactive", () => {
    // Replays of histories that predate the "swallow-terminal-tool-timeouts" patch.
    const toolTimeout = makeActivityFailure({
      activityType: RUN_TOOL_ACTIVITY_NAME,
      llmErrorType: null,
      llmErrorMessage: null,
    });
    const modelTimeout = makeActivityFailure();

    expect(
      isSwallowableWorkflowFailure(toolTimeout, { swallowToolTimeouts: false })
    ).toBe(false);
    // The model swallow predates the patch and is not affected by it.
    expect(
      isSwallowableWorkflowFailure(modelTimeout, { swallowToolTimeouts: false })
    ).toBe(true);
  });
});

describe("getWorkflowFailureDetails", () => {
  it("extracts the activity type, retry state and timeout type", () => {
    const failure = makeActivityFailure({
      activityType: RUN_TOOL_ACTIVITY_NAME,
      llmErrorType: null,
      llmErrorMessage: null,
    });

    expect(getWorkflowFailureDetails(failure)).toEqual({
      activityType: RUN_TOOL_ACTIVITY_NAME,
      retryState: "MAXIMUM_ATTEMPTS_REACHED",
      timeoutType: "HEARTBEAT",
    });
  });

  it("returns no details for non-activity failures", () => {
    expect(getWorkflowFailureDetails(new Error("boom"))).toEqual({});
  });
});
