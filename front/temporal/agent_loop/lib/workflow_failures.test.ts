import type { ProtoFailure } from "@temporalio/common";
import {
  ActivityFailure,
  RetryState,
  TimeoutFailure,
  TimeoutType,
} from "@temporalio/common";
import { describe, expect, it } from "vitest";

import {
  getTerminalRunModelAndCreateActionsProviderTimeout,
  isTerminalRunModelAndCreateActionsProviderTimeout,
  LLM_PROVIDER_TIMEOUT_ERROR_NAME,
  RUN_MODEL_AND_CREATE_ACTIONS_ACTIVITY_NAME,
} from "./workflow_failures";

const LLM_TIMEOUT_MESSAGE =
  "LLM error (llm_timeout_error): Anthropic is taking longer than expected. Please try again.";
const USER_FACING_LLM_TIMEOUT_MESSAGE =
  "Anthropic is taking longer than expected. Please try again.";

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

describe("getTerminalRunModelAndCreateActionsProviderTimeout", () => {
  it("matches terminal heartbeat timeouts with an LLM timeout cause", () => {
    const failure = makeActivityFailure();

    expect(getTerminalRunModelAndCreateActionsProviderTimeout(failure)).toEqual(
      {
        message: USER_FACING_LLM_TIMEOUT_MESSAGE,
        name: LLM_PROVIDER_TIMEOUT_ERROR_NAME,
        timeoutType: TimeoutType.HEARTBEAT,
      }
    );
    expect(isTerminalRunModelAndCreateActionsProviderTimeout(failure)).toBe(
      true
    );
  });

  it("matches terminal StartToClose timeouts with an LLM request timeout cause", () => {
    const failure = makeActivityFailure({
      llmErrorMessage: "LLM error (timeout_error): The request timed out.",
      timeoutType: TimeoutType.START_TO_CLOSE,
    });

    expect(getTerminalRunModelAndCreateActionsProviderTimeout(failure)).toEqual(
      {
        message: "The request timed out.",
        name: LLM_PROVIDER_TIMEOUT_ERROR_NAME,
        timeoutType: TimeoutType.START_TO_CLOSE,
      }
    );
  });

  it("ignores activity timeouts without an LLM timeout cause", () => {
    const failure = makeActivityFailure({
      llmErrorMessage: null,
      timeoutType: TimeoutType.START_TO_CLOSE,
    });

    expect(
      getTerminalRunModelAndCreateActionsProviderTimeout(failure)
    ).toBeNull();
    expect(isTerminalRunModelAndCreateActionsProviderTimeout(failure)).toBe(
      false
    );
  });

  it("ignores non-timeout LLM causes", () => {
    const failure = makeActivityFailure({
      llmErrorMessage: "LLM error (rate_limit_error): Too many requests.",
    });

    expect(
      getTerminalRunModelAndCreateActionsProviderTimeout(failure)
    ).toBeNull();
  });

  it("ignores non-terminal or unrelated activity failures", () => {
    expect(
      getTerminalRunModelAndCreateActionsProviderTimeout(
        makeActivityFailure({ retryState: RetryState.IN_PROGRESS })
      )
    ).toBeNull();
    expect(
      getTerminalRunModelAndCreateActionsProviderTimeout(
        makeActivityFailure({ activityType: "runToolActivity" })
      )
    ).toBeNull();
  });
});
