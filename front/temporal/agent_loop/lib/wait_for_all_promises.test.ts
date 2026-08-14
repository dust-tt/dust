import { describe, expect, it } from "vitest";

import { waitForAllPromises } from "./wait_for_all_promises";

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
});
