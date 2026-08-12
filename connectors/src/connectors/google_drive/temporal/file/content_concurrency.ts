import { heartbeat } from "@connectors/lib/temporal";
import { getStatsDClient } from "@connectors/types/shared/statsd";
import PQueue from "p-queue";

export const GOOGLE_DRIVE_CONTENT_CONCURRENCY = 2;
const CONTENT_CONCURRENCY_HEARTBEAT_INTERVAL_MS = 60_000;
const CONTENT_MEMORY_SAMPLE_INTERVAL_MS = 1_000;
const CONTENT_METRIC_PREFIX = "google_drive.content_processing";

const contentQueue = new PQueue({
  concurrency: GOOGLE_DRIVE_CONTENT_CONCURRENCY,
});
let activeContentOperations = 0;

type ContentLogger = {
  info: (context: Record<string, unknown>, message: string) => void;
};

type MemorySnapshot = ReturnType<typeof process.memoryUsage>;

function maxMemorySnapshot(
  currentPeak: MemorySnapshot,
  sample: MemorySnapshot
): MemorySnapshot {
  return {
    rss: Math.max(currentPeak.rss, sample.rss),
    heapTotal: Math.max(currentPeak.heapTotal, sample.heapTotal),
    heapUsed: Math.max(currentPeak.heapUsed, sample.heapUsed),
    external: Math.max(currentPeak.external, sample.external),
    arrayBuffers: Math.max(currentPeak.arrayBuffers, sample.arrayBuffers),
  };
}

function emitContentMemoryTelemetry({
  logger,
  fileSizeBytes,
  mimeType,
  queueWaitMs,
  processingDurationMs,
  outcome,
  activeOperationsAtStart,
  peakActiveOperations,
  memoryAtStart,
  peakMemory,
  memoryAtEnd,
}: {
  logger: ContentLogger;
  fileSizeBytes: number | null;
  mimeType: string;
  queueWaitMs: number;
  processingDurationMs: number;
  outcome: "success" | "error";
  activeOperationsAtStart: number;
  peakActiveOperations: number;
  memoryAtStart: MemorySnapshot;
  peakMemory: MemorySnapshot;
  memoryAtEnd: MemorySnapshot;
}) {
  const tags = [
    `mime_type:${mimeType}`,
    `file_size_known:${fileSizeBytes !== null}`,
    `outcome:${outcome}`,
  ];
  const statsDClient = getStatsDClient();

  statsDClient.distribution(
    `${CONTENT_METRIC_PREFIX}.queue_wait_ms`,
    queueWaitMs,
    tags
  );
  statsDClient.distribution(
    `${CONTENT_METRIC_PREFIX}.duration_ms`,
    processingDurationMs,
    tags
  );
  if (fileSizeBytes !== null) {
    statsDClient.distribution(
      `${CONTENT_METRIC_PREFIX}.file_size_bytes`,
      fileSizeBytes,
      tags
    );
  }
  for (const [memoryType, startBytes, peakBytes, endBytes] of [
    ["rss", memoryAtStart.rss, peakMemory.rss, memoryAtEnd.rss],
    [
      "heap_used",
      memoryAtStart.heapUsed,
      peakMemory.heapUsed,
      memoryAtEnd.heapUsed,
    ],
    [
      "external",
      memoryAtStart.external,
      peakMemory.external,
      memoryAtEnd.external,
    ],
    [
      "array_buffers",
      memoryAtStart.arrayBuffers,
      peakMemory.arrayBuffers,
      memoryAtEnd.arrayBuffers,
    ],
  ] as const) {
    statsDClient.distribution(
      `${CONTENT_METRIC_PREFIX}.memory.${memoryType}.start_bytes`,
      startBytes,
      tags
    );
    statsDClient.distribution(
      `${CONTENT_METRIC_PREFIX}.memory.${memoryType}.peak_bytes`,
      peakBytes,
      tags
    );
    statsDClient.distribution(
      `${CONTENT_METRIC_PREFIX}.memory.${memoryType}.end_bytes`,
      endBytes,
      tags
    );
    statsDClient.distribution(
      `${CONTENT_METRIC_PREFIX}.memory.${memoryType}.peak_growth_bytes`,
      peakBytes - startBytes,
      tags
    );
  }

  logger.info(
    {
      fileSizeBytes,
      mimeType,
      queueWaitMs,
      processingDurationMs,
      outcome,
      activeOperationsAtStart,
      peakActiveOperations,
      memoryAtStart,
      peakMemory,
      memoryAtEnd,
    },
    "Google Drive content memory telemetry"
  );
}

export async function runWithGoogleDriveContentConcurrency<T>({
  task,
  logger,
  fileSizeBytes,
  mimeType,
}: {
  task: () => Promise<T>;
  logger: ContentLogger;
  fileSizeBytes: number | null;
  mimeType: string;
}): Promise<T> {
  const queuedAtMs = Date.now();
  const abortController = new AbortController();
  let heartbeatTimeout: ReturnType<typeof setTimeout> | undefined;
  let heartbeatError: unknown;
  let taskStarted = false;
  let stopped = false;

  const heartbeatPromise = new Promise<never>((_resolve, reject) => {
    const scheduleHeartbeat = () => {
      heartbeatTimeout = setTimeout(() => {
        void heartbeat()
          .then(() => {
            if (!stopped) {
              scheduleHeartbeat();
            }
          })
          .catch((error) => {
            if (!stopped) {
              if (taskStarted) {
                // Keep the queue slot until the underlying content work settles. Aborting a
                // running PQueue task only rejects its wrapper; it cannot cancel the task itself.
                heartbeatError = error;
              } else {
                reject(error);
                abortController.abort();
              }
            }
          });
      }, CONTENT_CONCURRENCY_HEARTBEAT_INTERVAL_MS);
    };

    scheduleHeartbeat();
  });

  const taskPromise = contentQueue.add(
    async () => {
      taskStarted = true;
      activeContentOperations++;
      const startedAtMs = Date.now();
      const activeOperationsAtStart = activeContentOperations;
      let peakActiveOperations = activeContentOperations;
      const memoryAtStart = process.memoryUsage();
      let peakMemory = memoryAtStart;
      let outcome: "success" | "error" = "success";
      const memorySampleInterval = setInterval(() => {
        peakActiveOperations = Math.max(
          peakActiveOperations,
          activeContentOperations
        );
        peakMemory = maxMemorySnapshot(peakMemory, process.memoryUsage());
      }, CONTENT_MEMORY_SAMPLE_INTERVAL_MS);

      try {
        return await task();
      } catch (error) {
        outcome = "error";
        throw error;
      } finally {
        clearInterval(memorySampleInterval);
        peakActiveOperations = Math.max(
          peakActiveOperations,
          activeContentOperations
        );
        const memoryAtEnd = process.memoryUsage();
        peakMemory = maxMemorySnapshot(peakMemory, memoryAtEnd);
        try {
          emitContentMemoryTelemetry({
            logger,
            fileSizeBytes,
            mimeType,
            queueWaitMs: startedAtMs - queuedAtMs,
            processingDurationMs: Date.now() - startedAtMs,
            outcome,
            activeOperationsAtStart,
            peakActiveOperations,
            memoryAtStart,
            peakMemory,
            memoryAtEnd,
          });
        } finally {
          activeContentOperations--;
        }
      }
    },
    {
      signal: abortController.signal,
      throwOnTimeout: true,
    }
  );

  try {
    const result = await Promise.race([taskPromise, heartbeatPromise]);
    if (heartbeatError) {
      throw heartbeatError;
    }
    return result;
  } finally {
    stopped = true;
    if (heartbeatTimeout) {
      clearTimeout(heartbeatTimeout);
    }
  }
}
