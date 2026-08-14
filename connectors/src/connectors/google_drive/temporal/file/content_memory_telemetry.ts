import { getStatsDClient } from "@connectors/types/shared/statsd";

const CONTENT_MEMORY_SAMPLE_INTERVAL_MS = 1_000;
const CONTENT_METRIC_PREFIX = "google_drive.content_processing";

let activeContentOperations = 0;

type ContentLogger = {
  info: (context: Record<string, unknown>, message: string) => void;
};

type MemorySnapshot = ReturnType<typeof process.memoryUsage>;

export type GoogleDriveContentPhase =
  | "download_export"
  | "extraction"
  | "dust_upsert";

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

function emitMemoryDistributions({
  metricPrefix,
  tags,
  memoryAtStart,
  peakMemory,
  memoryAtEnd,
}: {
  metricPrefix: string;
  tags: string[];
  memoryAtStart: MemorySnapshot;
  peakMemory: MemorySnapshot;
  memoryAtEnd: MemorySnapshot;
}) {
  const statsDClient = getStatsDClient();

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
      `${metricPrefix}.memory.${memoryType}.start_bytes`,
      startBytes,
      tags
    );
    statsDClient.distribution(
      `${metricPrefix}.memory.${memoryType}.peak_bytes`,
      peakBytes,
      tags
    );
    statsDClient.distribution(
      `${metricPrefix}.memory.${memoryType}.end_bytes`,
      endBytes,
      tags
    );
    statsDClient.distribution(
      `${metricPrefix}.memory.${memoryType}.peak_growth_bytes`,
      peakBytes - startBytes,
      tags
    );
  }
}

function emitContentMemoryTelemetry({
  logger,
  fileSizeBytes,
  mimeType,
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
  emitMemoryDistributions({
    metricPrefix: CONTENT_METRIC_PREFIX,
    tags,
    memoryAtStart,
    peakMemory,
    memoryAtEnd,
  });

  logger.info(
    {
      fileSizeBytes,
      mimeType,
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

function emitContentPhaseMemoryTelemetry({
  logger,
  mimeType,
  phase,
  payloadSizeBytes,
  processingDurationMs,
  outcome,
  memoryAtStart,
  peakMemory,
  memoryAtEnd,
}: {
  logger: ContentLogger;
  mimeType: string;
  phase: GoogleDriveContentPhase;
  payloadSizeBytes: number | null;
  processingDurationMs: number;
  outcome: "success" | "error";
  memoryAtStart: MemorySnapshot;
  peakMemory: MemorySnapshot;
  memoryAtEnd: MemorySnapshot;
}) {
  const metricPrefix = `${CONTENT_METRIC_PREFIX}.phase`;
  const tags = [
    `phase:${phase}`,
    `mime_type:${mimeType}`,
    `payload_size_known:${payloadSizeBytes !== null}`,
    `outcome:${outcome}`,
  ];
  const statsDClient = getStatsDClient();

  statsDClient.distribution(
    `${metricPrefix}.duration_ms`,
    processingDurationMs,
    tags
  );
  if (payloadSizeBytes !== null) {
    statsDClient.distribution(
      `${metricPrefix}.payload_size_bytes`,
      payloadSizeBytes,
      tags
    );
  }
  emitMemoryDistributions({
    metricPrefix,
    tags,
    memoryAtStart,
    peakMemory,
    memoryAtEnd,
  });

  logger.info(
    {
      mimeType,
      phase,
      payloadSizeBytes,
      processingDurationMs,
      outcome,
      memoryAtStart,
      peakMemory,
      memoryAtEnd,
    },
    "Google Drive content phase memory telemetry"
  );
}

export function getGoogleDrivePayloadSizeBytes(data: unknown): number | null {
  if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) {
    return data.byteLength;
  }

  switch (typeof data) {
    case "string":
      return Buffer.byteLength(data, "utf8");
    case "number":
    case "boolean":
    case "bigint":
      return Buffer.byteLength(data.toString(), "utf8");
    default:
      return null;
  }
}

export async function runWithGoogleDriveContentPhaseMemoryTelemetry<T>({
  task,
  getPayloadSizeBytes,
  logger,
  mimeType,
  phase,
}: {
  task: () => Promise<T>;
  getPayloadSizeBytes: (result: T) => number | null;
  logger: ContentLogger;
  mimeType: string;
  phase: GoogleDriveContentPhase;
}): Promise<T> {
  const startedAtMs = Date.now();
  const memoryAtStart = process.memoryUsage();
  let peakMemory = memoryAtStart;
  let outcome: "success" | "error" = "success";
  let payloadSizeBytes: number | null = null;
  const memorySampleInterval = setInterval(() => {
    peakMemory = maxMemorySnapshot(peakMemory, process.memoryUsage());
  }, CONTENT_MEMORY_SAMPLE_INTERVAL_MS);

  try {
    const result = await task();
    payloadSizeBytes = getPayloadSizeBytes(result);
    return result;
  } catch (error) {
    outcome = "error";
    throw error;
  } finally {
    clearInterval(memorySampleInterval);
    const memoryAtEnd = process.memoryUsage();
    peakMemory = maxMemorySnapshot(peakMemory, memoryAtEnd);
    emitContentPhaseMemoryTelemetry({
      logger,
      mimeType,
      phase,
      payloadSizeBytes,
      processingDurationMs: Date.now() - startedAtMs,
      outcome,
      memoryAtStart,
      peakMemory,
      memoryAtEnd,
    });
  }
}

export async function runWithGoogleDriveContentMemoryTelemetry<T>({
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
}
