import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getGoogleDrivePayloadSizeBytes,
  runWithGoogleDriveContentMemoryTelemetry,
  runWithGoogleDriveContentPhaseMemoryTelemetry,
} from "./content_memory_telemetry";

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

describe("runWithGoogleDriveContentPhaseMemoryTelemetry", () => {
  it("records actual payload bytes and memory for a processing phase", async () => {
    const memoryAtStart = {
      rss: 1_000,
      heapTotal: 500,
      heapUsed: 300,
      external: 200,
      arrayBuffers: 100,
    };
    const memoryAtEnd = {
      rss: 1_800,
      heapTotal: 700,
      heapUsed: 600,
      external: 900,
      arrayBuffers: 800,
    };
    vi.spyOn(process, "memoryUsage")
      .mockReturnValueOnce(memoryAtStart)
      .mockReturnValueOnce(memoryAtEnd);

    const result = await runWithGoogleDriveContentPhaseMemoryTelemetry({
      task: async () => new TextEncoder().encode("payload"),
      getPayloadSizeBytes: (payload) => getGoogleDrivePayloadSizeBytes(payload),
      logger,
      mimeType: "application/vnd.google-apps.document",
      phase: "download_export",
    });

    expect(result.byteLength).toBe(7);
    const tags = [
      "phase:download_export",
      "mime_type:application/vnd.google-apps.document",
      "payload_size_known:true",
      "outcome:success",
    ];
    expect(statsDClient.distribution).toHaveBeenCalledWith(
      "google_drive.content_processing.phase.payload_size_bytes",
      7,
      tags
    );
    expect(statsDClient.distribution).toHaveBeenCalledWith(
      "google_drive.content_processing.phase.memory.rss.peak_growth_bytes",
      800,
      tags
    );
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        mimeType: "application/vnd.google-apps.document",
        phase: "download_export",
        payloadSizeBytes: 7,
        outcome: "success",
        memoryAtStart,
        peakMemory: memoryAtEnd,
        memoryAtEnd,
      }),
      "Google Drive content phase memory telemetry"
    );
  });
});

describe("getGoogleDrivePayloadSizeBytes", () => {
  it("measures binary and UTF-8 payloads", () => {
    expect(getGoogleDrivePayloadSizeBytes(new ArrayBuffer(42))).toBe(42);
    expect(getGoogleDrivePayloadSizeBytes("hé")).toBe(3);
    expect(getGoogleDrivePayloadSizeBytes(123)).toBe(3);
  });

  it("returns null when the response representation is unknown", () => {
    expect(getGoogleDrivePayloadSizeBytes(null)).toBeNull();
    expect(getGoogleDrivePayloadSizeBytes({ payload: "unknown" })).toBeNull();
  });
});
