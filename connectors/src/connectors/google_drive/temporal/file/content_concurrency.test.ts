import { heartbeat } from "@connectors/lib/temporal";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  GOOGLE_DRIVE_CONTENT_CONCURRENCY,
  runWithGoogleDriveContentConcurrency,
} from "./content_concurrency";

vi.mock("@connectors/lib/temporal", () => ({
  heartbeat: vi.fn().mockResolvedValue(undefined),
}));

afterEach(() => {
  vi.useRealTimers();
  vi.mocked(heartbeat).mockReset().mockResolvedValue(undefined);
});

function makeDeferred() {
  let resolve = () => {};
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });

  return { promise, resolve };
}

describe("runWithGoogleDriveContentConcurrency", () => {
  it("runs at most two content tasks concurrently", async () => {
    const deferredTasks = Array.from(
      { length: GOOGLE_DRIVE_CONTENT_CONCURRENCY + 1 },
      makeDeferred
    );
    let activeTasks = 0;
    let maxActiveTasks = 0;

    const tasks = deferredTasks.map((deferredTask) =>
      runWithGoogleDriveContentConcurrency(async () => {
        activeTasks++;
        maxActiveTasks = Math.max(maxActiveTasks, activeTasks);
        await deferredTask.promise;
        activeTasks--;
      })
    );

    await expect.poll(() => activeTasks).toBe(GOOGLE_DRIVE_CONTENT_CONCURRENCY);
    expect(maxActiveTasks).toBe(GOOGLE_DRIVE_CONTENT_CONCURRENCY);

    const firstDeferredTask = deferredTasks[0];
    if (!firstDeferredTask) {
      throw new Error("Expected at least one deferred task");
    }
    firstDeferredTask.resolve();
    await expect
      .poll(() => maxActiveTasks)
      .toBe(GOOGLE_DRIVE_CONTENT_CONCURRENCY);

    for (const deferredTask of deferredTasks) {
      deferredTask.resolve();
    }
    await Promise.all(tasks);

    expect(maxActiveTasks).toBe(GOOGLE_DRIVE_CONTENT_CONCURRENCY);
  });

  it("keeps a slot until a running task settles after heartbeat failure", async () => {
    vi.useFakeTimers();
    const runningTasks = Array.from(
      { length: GOOGLE_DRIVE_CONTENT_CONCURRENCY },
      makeDeferred
    );
    const heartbeatError = new Error("Activity cancelled");
    vi.mocked(heartbeat).mockRejectedValue(heartbeatError);
    let replacementStarted = false;

    const tasks = runningTasks.map((deferredTask) =>
      runWithGoogleDriveContentConcurrency(() => deferredTask.promise)
    );
    const taskAssertions = tasks.map((task) =>
      expect(task).rejects.toBe(heartbeatError)
    );
    await vi.waitFor(() => {
      expect(vi.getTimerCount()).toBe(GOOGLE_DRIVE_CONTENT_CONCURRENCY);
    });

    await vi.advanceTimersByTimeAsync(60_000);
    const replacementTask = runWithGoogleDriveContentConcurrency(async () => {
      replacementStarted = true;
    });
    await Promise.resolve();

    expect(replacementStarted).toBe(false);

    for (const runningTask of runningTasks) {
      runningTask.resolve();
    }
    await Promise.all(taskAssertions);
    await replacementTask;

    expect(replacementStarted).toBe(true);
  });
});
