import { afterEach, describe, expect, it, vi } from "vitest";

import { runWithGoogleDriveContentMemoryTelemetry } from "./content_memory_telemetry";

const { statsDClient } = vi.hoisted(() => ({
  statsDClient: {
    distribution: vi.fn(),
  },
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
  return runWithGoogleDriveContentMemoryTelemetry({
    task,
    logger,
    fileSizeBytes: 1_024,
    mimeType: "text/plain",
  });
}

describe("runWithGoogleDriveContentMemoryTelemetry", () => {
  it("does not limit concurrent content tasks", async () => {
    const deferredTasks = Array.from({ length: 3 }, makeDeferred);
    let activeTasks = 0;

    const tasks = deferredTasks.map((deferredTask) =>
      runTask(async () => {
        activeTasks++;
        await deferredTask.promise;
        activeTasks--;
      })
    );

    await expect.poll(() => activeTasks).toBe(deferredTasks.length);

    for (const deferredTask of deferredTasks) {
      deferredTask.resolve();
    }
    await Promise.all(tasks);
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

    const taskPromise = runWithGoogleDriveContentMemoryTelemetry({
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
