import {
  ActivityFailure,
  ApplicationFailure,
  RetryState,
  TimeoutFailure,
  TimeoutType,
} from "@temporalio/common";
import { describe, expect, it } from "vitest";

import { waitForAllPromises } from "./wait_for_all_promises";
import {
  isTerminalRunToolTimeout,
  RUN_TOOL_ACTIVITY_NAME,
} from "./workflow_failures";

describe("waitForAllPromises", () => {
  it("preserves result order after every promise succeeds", async () => {
    await expect(
      waitForAllPromises([Promise.resolve("first"), Promise.resolve("second")])
    ).resolves.toEqual(["first", "second"]);
  });

  it("waits for the remaining promises before reporting a rejection", async () => {
    const activityFailure = new Error("activity cancelled");
    let resolveRemainingActivity: (() => void) | undefined;
    const remainingActivity = new Promise<void>((resolve) => {
      resolveRemainingActivity = resolve;
    });

    const result = waitForAllPromises([
      Promise.reject(activityFailure),
      remainingActivity,
    ]);
    let rejectionReported = false;
    void result.catch(() => {
      rejectionReported = true;
    });

    await Promise.resolve();
    expect(rejectionReported).toBe(false);

    resolveRemainingActivity?.();
    await expect(result).rejects.toBe(activityFailure);
  });

  it("propagates the preferred rejection over an earlier one", async () => {
    const first = new Error("first");
    const preferred = new Error("preferred");

    await expect(
      waitForAllPromises([Promise.reject(first), Promise.reject(preferred)], {
        preferRejection: (reason) => reason === preferred,
      })
    ).rejects.toBe(preferred);
  });

  it("falls back to the first rejection when none is preferred", async () => {
    const first = new Error("first");
    const second = new Error("second");

    await expect(
      waitForAllPromises([Promise.reject(first), Promise.reject(second)], {
        preferRejection: () => false,
      })
    ).rejects.toBe(first);
  });

  it("lets a sibling application failure win over a swallowable tool timeout", async () => {
    // Regression: the agent loop must not swallow a real tool failure because a swallowable
    // infrastructure timeout on a sibling tool rejected first.
    const toolTimeout = new ActivityFailure(
      "Activity task timed out",
      RUN_TOOL_ACTIVITY_NAME,
      "activity-id-1",
      RetryState.MAXIMUM_ATTEMPTS_REACHED,
      "worker-id",
      new TimeoutFailure("activity timed out", undefined, TimeoutType.HEARTBEAT)
    );
    const applicationFailure = new ActivityFailure(
      "Activity task failed",
      RUN_TOOL_ACTIVITY_NAME,
      "activity-id-2",
      RetryState.MAXIMUM_ATTEMPTS_REACHED,
      "worker-id",
      ApplicationFailure.create({ message: "tool blew up" })
    );

    await expect(
      waitForAllPromises(
        [Promise.reject(toolTimeout), Promise.reject(applicationFailure)],
        { preferRejection: (reason) => !isTerminalRunToolTimeout(reason) }
      )
    ).rejects.toBe(applicationFailure);
  });
});
