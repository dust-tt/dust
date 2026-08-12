import { heartbeat } from "@connectors/lib/temporal";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  GOOGLE_DRIVE_CONTENT_CONCURRENCY,
  runWithGoogleDriveContentConcurrency,
} from "./content_concurrency";

const { statsDClient } = vi.hoisted(() => ({
  statsDClient: {
    distribution: vi.fn(),
  },
}));

vi.mock("@connectors/lib/temporal", () => ({
  heartbeat: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@connectors/types/shared/statsd", () => ({
  getStatsDClient: () => statsDClient,
}));

const logger = {
  info: vi.fn(),
};

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.mocked(heartbeat).mockReset().mockResolvedValue(undefined);
  statsDClient.distribution.mockReset();
  logger.info.mockReset();
});

function makeDeferred() {
  let resolve = () => {};
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });

  return { promise, resolve };
}

function runTask<T>(task: () => Promise<T>) {
  return runWithGoogleDriveContentConcurrency({
    task,
    logger,
    fileSizeBytes: 1_024,
    mimeType: "text/plain",
  });
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
      runTask(async () => {
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
    let startedTasks = 0;
    let replacementStarted = false;

    const tasks = runningTasks.map((deferredTask) =>
      runTask(async () => {
        startedTasks++;
        await deferredTask.promise;
      })
    );
    const taskAssertions = tasks.map((task) =>
      expect(task).rejects.toBe(heartbeatError)
    );
    await vi.waitFor(() => {
      expect(startedTasks).toBe(GOOGLE_DRIVE_CONTENT_CONCURRENCY);
    });

    await vi.advanceTimersByTimeAsync(60_000);
    const replacementTask = runTask(async () => {
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

  it("records file metadata and process memory while content is processed", async () => {
    vi.useFakeTimers();
    const task = makeDeferred();
    const memoryAtStart = {
      rss: 1_000,
      heapTotal: 500,
      heapUsed: 300,
      external: 200,
      arrayBuffers: 100,
    };
    const sampledMemory = {
      rss: 1_800,
      heapTotal: 700,
      heapUsed: 600,
      external: 900,
      arrayBuffers: 800,
    };
    const memoryAtEnd = {
      rss: 1_400,
      heapTotal: 600,
      heapUsed: 400,
      external: 500,
      arrayBuffers: 400,
    };
    vi.spyOn(process, "memoryUsage")
      .mockReturnValueOnce(memoryAtStart)
      .mockReturnValueOnce(sampledMemory)
      .mockReturnValueOnce(memoryAtEnd);

    const taskPromise = runWithGoogleDriveContentConcurrency({
      task: () => task.promise,
      logger,
      fileSizeBytes: 42_000,
      mimeType: "application/pdf",
    });
    await vi.advanceTimersByTimeAsync(1_000);
    task.resolve();
    await taskPromise;

    expect(logger.info).toHaveBeenCalledWith(
      {
        fileSizeBytes: 42_000,
        mimeType: "application/pdf",
        queueWaitMs: 0,
        processingDurationMs: 1_000,
        outcome: "success",
        activeOperationsAtStart: 1,
        peakActiveOperations: 1,
        memoryAtStart,
        peakMemory: sampledMemory,
        memoryAtEnd,
      },
      "Google Drive content memory telemetry"
    );
    expect(statsDClient.distribution).toHaveBeenCalledWith(
      "google_drive.content_processing.file_size_bytes",
      42_000,
      ["mime_type:application/pdf", "file_size_known:true", "outcome:success"]
    );
    expect(statsDClient.distribution).toHaveBeenCalledWith(
      "google_drive.content_processing.memory.rss.peak_growth_bytes",
      800,
      ["mime_type:application/pdf", "file_size_known:true", "outcome:success"]
    );
  });
});
