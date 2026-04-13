import { isTerminalRunModelAndCreateActionsTimeout } from "@app/temporal/agent_loop/lib/workflow_failures";
import {
  ActivityFailure,
  RetryState,
  TimeoutFailure,
  TimeoutType,
} from "@temporalio/common";
import { describe, expect, it } from "vitest";

const ACTIVITY_TASK_TIMED_OUT_MESSAGE = "Activity task timed out";
const RUN_MODEL_AND_CREATE_ACTIONS_ACTIVITY_NAME =
  "runModelAndCreateActionsActivity";

function makeActivityFailure({
  activityType = RUN_MODEL_AND_CREATE_ACTIONS_ACTIVITY_NAME,
  retryState = RetryState.MAXIMUM_ATTEMPTS_REACHED,
  timeoutType = TimeoutType.START_TO_CLOSE,
}: {
  activityType?: string;
  retryState?: RetryState;
  timeoutType?: TimeoutType;
}) {
  return new ActivityFailure(
    ACTIVITY_TASK_TIMED_OUT_MESSAGE,
    activityType,
    "10",
    retryState,
    "worker",
    new TimeoutFailure("activity StartToClose timeout", null, timeoutType)
  );
}

describe("isTerminalRunModelAndCreateActionsTimeout", () => {
  it("returns true for the terminal runModel start-to-close timeout", () => {
    expect(
      isTerminalRunModelAndCreateActionsTimeout(makeActivityFailure({}))
    ).toBe(true);
  });

  it("returns false for a different activity type", () => {
    expect(
      isTerminalRunModelAndCreateActionsTimeout(
        makeActivityFailure({ activityType: "runToolActivity" })
      )
    ).toBe(false);
  });

  it("returns false before the last retry attempt", () => {
    expect(
      isTerminalRunModelAndCreateActionsTimeout(
        makeActivityFailure({ retryState: RetryState.IN_PROGRESS })
      )
    ).toBe(false);
  });

  it("returns false for non start-to-close timeouts", () => {
    expect(
      isTerminalRunModelAndCreateActionsTimeout(
        makeActivityFailure({ timeoutType: TimeoutType.HEARTBEAT })
      )
    ).toBe(false);
  });
});
