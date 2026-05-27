import {
  ActivityFailure,
  RetryState,
  TimeoutFailure,
  TimeoutType,
} from "@temporalio/common";
import { describe, expect, it } from "vitest";

import {
  getTerminalRunModelAndCreateActionsTimeout,
  isTerminalRunModelAndCreateActionsTimeout,
  RUN_MODEL_AND_CREATE_ACTIONS_ACTIVITY_NAME,
} from "./workflow_failures";

function makeActivityFailure({
  activityType = RUN_MODEL_AND_CREATE_ACTIONS_ACTIVITY_NAME,
  retryState = RetryState.MAXIMUM_ATTEMPTS_REACHED,
  timeoutType = TimeoutType.START_TO_CLOSE,
}: {
  activityType?: string;
  retryState?: RetryState;
  timeoutType?: TimeoutType;
} = {}) {
  return new ActivityFailure(
    "Activity task timed out",
    activityType,
    "activity-id",
    retryState,
    "worker-id",
    new TimeoutFailure("activity timed out", undefined, timeoutType)
  );
}

describe("getTerminalRunModelAndCreateActionsTimeout", () => {
  it("matches terminal StartToClose timeouts for the model activity", () => {
    const failure = makeActivityFailure();

    expect(getTerminalRunModelAndCreateActionsTimeout(failure)).toEqual({
      activityType: RUN_MODEL_AND_CREATE_ACTIONS_ACTIVITY_NAME,
      timeoutType: TimeoutType.START_TO_CLOSE,
    });
    expect(isTerminalRunModelAndCreateActionsTimeout(failure)).toBe(true);
  });

  it("matches terminal heartbeat timeouts for the model activity", () => {
    const failure = makeActivityFailure({
      timeoutType: TimeoutType.HEARTBEAT,
    });

    expect(getTerminalRunModelAndCreateActionsTimeout(failure)).toEqual({
      activityType: RUN_MODEL_AND_CREATE_ACTIONS_ACTIVITY_NAME,
      timeoutType: TimeoutType.HEARTBEAT,
    });
    expect(isTerminalRunModelAndCreateActionsTimeout(failure)).toBe(true);
  });

  it("matches activity timeout retry states from Temporal", () => {
    const failure = makeActivityFailure({
      retryState: RetryState.TIMEOUT,
      timeoutType: TimeoutType.HEARTBEAT,
    });

    expect(isTerminalRunModelAndCreateActionsTimeout(failure)).toBe(true);
  });

  it("ignores non-terminal model activity failures", () => {
    const failure = makeActivityFailure({
      retryState: RetryState.IN_PROGRESS,
      timeoutType: TimeoutType.HEARTBEAT,
    });

    expect(getTerminalRunModelAndCreateActionsTimeout(failure)).toBeNull();
    expect(isTerminalRunModelAndCreateActionsTimeout(failure)).toBe(false);
  });

  it("ignores timeout failures from other activities", () => {
    const failure = makeActivityFailure({
      activityType: "runToolActivity",
      timeoutType: TimeoutType.HEARTBEAT,
    });

    expect(getTerminalRunModelAndCreateActionsTimeout(failure)).toBeNull();
    expect(isTerminalRunModelAndCreateActionsTimeout(failure)).toBe(false);
  });
});
